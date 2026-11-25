import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import PasosAsistente from '../components/PasosAsistente.jsx'
import SelectorGrupos from '../components/SelectorGrupos.jsx'
import SeccionActividades from '../components/SeccionActividades.jsx'
import EditorActividades from '../components/EditorActividades.jsx'
import EditorRango from '../components/EditorRango.jsx'
import BloqueProfe from '../components/BloqueProfe.jsx'
import AsistenteBloque from '../components/AsistenteBloque.jsx'
import { supabase } from '../services/supabaseClient.js'
import {
  actualizarRutina,
  cargarEjercicios,
  cargarRutinaCompleta,
  sincronizarEjercicios,
} from '../services/rutinas.js'
import {
  agruparEnBloques,
  bloqueABorrador,
  borradorAFilas,
  duplicarBloque,
  moverBloque,
  moverBloqueA,
  quitarBloque,
  reemplazarBloque,
} from '../utils/bloques.js'
import { textoRango } from '../utils/formatos.js'
import { textoGrupos } from '../data/gruposMusculares.js'
import { SECCIONES_ACTIVIDADES } from '../data/actividades.js'
import { PASOS_RUTINA } from '../data/asistente.js'
import { mostrarAviso } from '../services/avisos.js'
import { cargarBiblioteca } from '../services/biblioteca.js'
import { estaArchivado } from '../utils/biblioteca.js'
import { ejerciciosParaCicloNuevo, semanaDelCiclo } from '../utils/ciclos.js'
import { MAXIMO_SEMANAS } from '../utils/semanas.js'
import { obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'
import Esqueleto from '../components/Esqueleto.jsx'
import Icono from '../components/Icono.jsx'
import { PANTALLA_COMPU, useCoincide } from '../components/useCoincide.js'
import { useConfirmar } from '../components/ConfirmarAccion.jsx'
import CopiarAVariosAlumnos, { avisarCopia } from '../components/CopiarAVariosAlumnos.jsx'

// De 2 a 12 semanas (lo mismo que acepta la planilla de Excel).
const OPCIONES_SEMANAS = Array.from({ length: MAXIMO_SEMANAS - 1 }, (_, indice) => indice + 2)

const ERROR_GUARDAR = 'No pudimos guardar el cambio. Revisá tu conexión y probá de nuevo.'

// Paso 3 del asistente: la rutina (o plantilla) armada tal como la va a
// ver el cliente, con los controles del profe en cada parte:
//
//   Rutina: nombre · grupos musculares          [Editar datos]
//   Calentamiento previo                         [Configurar]
//   Ejercicios (bloques numerados)  [↑ ↓ Editar Quitar] + Agregar ejercicios
//   Pausa entre ejercicios                       [Configurar]
//   Ciclo (semanas y progresión)                 [Configurar]
//   Vuelta a la calma (opcional)                 [Agregar]
//   [Guardar rutina]
//
// Cada cambio se guarda solo, al momento. Una rutina nueva queda en
// borrador (el cliente no la ve) hasta que se toca "Guardar rutina". En el
// celular ese botón queda fijo abajo, siempre a la vista.
//
// En la compu: los bloques se arrastran con el mouse para cambiarlos de
// lugar (además de ↑ ↓), y hay atajos de teclado (components/
// AtajosDeTeclado.jsx): Alt + N agrega ejercicios y Ctrl + Enter guarda la
// rutina. Dentro del asistente, Enter pasa al casillero siguiente.
//
// tipo = 'rutina'    → /profe/rutinas/:id
// tipo = 'plantilla' → /profe/plantillas/:id
export default function ProfeRutinaEditor({ tipo }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [confirmar, hojaConfirmar] = useConfirmar()
  const esRutina = tipo === 'rutina'
  const nombreTipo = esRutina ? 'rutina' : 'plantilla'

  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(null)
  const [items, setItems] = useState([])
  const [biblioteca, setBiblioteca] = useState([])
  // Ejercicios de la rutina que están archivados en la biblioteca: siguen
  // acá, pero se marcan para que el profe sepa que conviene cambiarlos.
  const idsArchivados = useMemo(
    () => new Set(biblioteca.filter(estaArchivado).map((ejercicio) => ejercicio.id)),
    [biblioteca],
  )
  const [cliente, setCliente] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [guardandoRutina, setGuardandoRutina] = useState(false)

  // Qué parte se está editando: 'datos', 'calentamiento', 'pausa' o
  // 'vuelta_calma' (una a la vez, para no mostrar todo junto).
  const [editando, setEditando] = useState(null)
  const [datosEdit, setDatosEdit] = useState(null)
  const [pausaEdit, setPausaEdit] = useState({ min: '', max: '' })
  const [semanasEdit, setSemanasEdit] = useState('')

  // Asistente de bloque abierto: { indiceBloque, borrador, calentamientoDe }
  // (indiceBloque null = bloque nuevo; calentamientoDe = posición del
  // ejercicio cuyas series de calentamiento se quieren cargar).
  const [asistente, setAsistente] = useState(null)
  const [copiandoAVarios, setCopiandoAVarios] = useState(false)
  // Arrastrar bloques (compu): cuál se está llevando y sobre cuál está.
  const [arrastre, setArrastre] = useState({ desde: null, sobre: null })
  const enCompu = useCoincide(PANTALLA_COMPU)

  useEffect(() => {
    cargar()
  }, [tipo, id])

  // Atajos de teclado del editor (con el asistente cerrado).
  useEffect(() => {
    if (asistente || editando || copiandoAVarios || !datos) return undefined
    function alApretarTecla(event) {
      if (event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setAsistente({ indiceBloque: null, borrador: null })
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!guardandoRutina) finalizar()
      }
    }
    window.addEventListener('keydown', alApretarTecla)
    return () => window.removeEventListener('keydown', alApretarTecla)
  })

  async function cargar() {
    setCargando(true)
    const [{ datos: rutina, ejercicios }, { ejercicios: listaBiblioteca }] = await Promise.all([
      cargarRutinaCompleta(tipo, id),
      cargarBiblioteca(),
    ])
    let perfil = null
    if (esRutina && rutina?.cliente_id) {
      const { data } = await supabase
        .from('perfiles')
        .select('id, nombre, apellido, plan')
        .eq('id', rutina.cliente_id)
        .single()
      perfil = data || null
    }
    setDatos(rutina)
    setItems(ejercicios)
    setBiblioteca(listaBiblioteca || [])
    setCliente(perfil)
    setCargando(false)
  }

  // --- Datos generales de la rutina ---

  async function guardarCampos(cambios) {
    const anteriores = datos
    setDatos((actual) => ({ ...actual, ...cambios }))
    const { error } = await actualizarRutina(tipo, id, cambios)
    if (error) {
      setDatos(anteriores)
      setMensaje(ERROR_GUARDAR)
      return false
    }
    setMensaje('')
    mostrarAviso('Guardado')
    return true
  }

  function abrirEdicion(seccion) {
    setMensaje('')
    if (seccion === 'datos') {
      setDatosEdit({
        nombre: datos.nombre || '',
        grupos: datos.grupos_musculares || [],
        descripcion: datos.descripcion || '',
      })
    }
    if (seccion === 'pausa')
      setPausaEdit({ min: datos.pausa_min ?? '', max: datos.pausa_max ?? '' })
    if (seccion === 'ciclo') setSemanasEdit(datos.ciclo_semanas ?? '')
    setEditando(seccion)
  }

  async function guardarDatos() {
    if (!datosEdit.nombre.trim()) {
      setMensaje(`La ${nombreTipo} necesita un nombre.`)
      return
    }
    const ok = await guardarCampos({
      nombre: datosEdit.nombre.trim(),
      grupos_musculares: datosEdit.grupos,
      // "musculos" es el texto que ve el cliente en la tarjeta de la rutina.
      musculos: datosEdit.grupos.length ? textoGrupos(datosEdit.grupos) : datos.musculos,
      descripcion: datosEdit.descripcion.trim() || null,
    })
    if (ok) setEditando(null)
  }

  async function guardarActividades(seccion, lista) {
    const ok = await guardarCampos({ [seccion]: lista })
    if (ok) setEditando(null)
  }

  async function guardarPausa() {
    const min = pausaEdit.min === '' ? null : Number(pausaEdit.min)
    let max = pausaEdit.max === '' ? null : Number(pausaEdit.max)
    if (min !== null && max !== null && min > max) {
      setMensaje('La pausa mínima no puede ser mayor que la máxima.')
      return
    }
    if (max === null) max = min
    const ok = await guardarCampos({ pausa_min: min ?? max, pausa_max: max })
    if (ok) setEditando(null)
  }

  // --- Ciclo (planificación por semanas) ---

  async function guardarCiclo() {
    const semanas = semanasEdit === '' ? null : Number(semanasEdit)
    const cambios = { ciclo_semanas: semanas }
    // En una rutina ya guardada, el ciclo arranca hoy (si no había empezado).
    if (esRutina) {
      cambios.ciclo_inicio = semanas
        ? datos.ciclo_inicio || (datos.publicada === false ? null : obtenerFechaHoyISO())
        : null
    }
    const ok = await guardarCampos(cambios)
    if (ok) setEditando(null)
  }

  // Ciclo nuevo: cada ejercicio con progresión arranca desde el peso de la
  // última semana del ciclo anterior, y se vuelve a la semana 1.
  async function empezarCicloNuevo() {
    const semanas = Number(datos.ciclo_semanas)
    const seguro = await confirmar({
      titulo: '¿Empezar un ciclo nuevo?',
      texto: `Arranca hoy un ciclo de ${semanas} semanas. Los ejercicios que suben de peso arrancan desde el peso de la última semana; los que tienen cada semana distinta repiten su plan.`,
      confirmar: 'Empezar ciclo nuevo',
      peligro: false,
    })
    if (!seguro) return
    const error = await aplicarLista(ejerciciosParaCicloNuevo(items, semanas))
    if (error) {
      setMensaje(error)
      return
    }
    await guardarCampos({ ciclo_inicio: obtenerFechaHoyISO() })
  }

  // --- Bloques de ejercicios ---

  // Guarda la lista nueva de ejercicios y la vuelve a leer (así los
  // ejercicios recién agregados tienen su id). Devuelve un texto de
  // error, o '' si salió bien.
  async function aplicarLista(nuevaLista) {
    const anteriores = items
    setItems(nuevaLista)
    const error = await sincronizarEjercicios(tipo, id, anteriores, nuevaLista)
    setItems(await cargarEjercicios(tipo, id))
    if (!error) mostrarAviso('Guardado')
    return error ? ERROR_GUARDAR : ''
  }

  async function duplicarUnBloque(indiceBloque) {
    setMensaje(await aplicarLista(duplicarBloque(items, indiceBloque)))
  }

  async function guardarBloque(borrador) {
    const filas = borradorAFilas(borrador)
    const error = await aplicarLista(reemplazarBloque(items, asistente.indiceBloque, filas))
    if (!error) setAsistente(null)
    return error
  }

  async function moverUnBloque(indiceBloque, direccion) {
    setMensaje(await aplicarLista(moverBloque(items, indiceBloque, direccion)))
  }

  // Soltó un bloque arrastrado sobre otro: queda en ese lugar.
  async function soltarBloque(hasta) {
    const desde = arrastre.desde
    setArrastre({ desde: null, sobre: null })
    if (desde === null || desde === hasta) return
    setMensaje(await aplicarLista(moverBloqueA(items, desde, hasta)))
  }

  async function quitarUnBloque(bloque, indiceBloque) {
    const nombres = bloque.items.map(({ item }) => item.ejercicios?.nombre).join(' + ')
    const seguro = await confirmar({
      titulo: bloque.items.length > 1 ? '¿Quitar estos ejercicios?' : '¿Quitar este ejercicio?',
      texto: `"${nombres}" sale de la ${nombreTipo}.`,
      confirmar: 'Sí, quitar',
      cancelar: 'No, dejarlo',
    })
    if (!seguro) return
    setMensaje(await aplicarLista(quitarBloque(items, indiceBloque)))
  }

  // --- Guardar rutina ---

  const volverA = esRutina
    ? datos?.cliente_id
      ? `/profe/clientes/${datos.cliente_id}?tab=rutinas`
      : '/profe/clientes'
    : '/profe/plantillas'

  async function finalizar() {
    if (items.length === 0) {
      setMensaje(`Agregá al menos un ejercicio antes de guardar la ${nombreTipo}.`)
      return
    }
    // Rutina nueva: se publica (el cliente ya la ve) y se pasa al último
    // paso, elegir qué días la hace.
    if (esRutina && datos.publicada === false) {
      setGuardandoRutina(true)
      const ok = await guardarCampos(
        datos.ciclo_semanas && !datos.ciclo_inicio
          ? { publicada: true, ciclo_inicio: obtenerFechaHoyISO() }
          : { publicada: true },
      )
      setGuardandoRutina(false)
      if (!ok) return
      navigate(`/profe/rutinas/${id}/dias`, { state: { recienGuardada: true } })
      return
    }
    navigate(volverA)
  }

  if (cargando || !datos) {
    return (
      <ProfeLayout titulo={esRutina ? 'Rutina' : 'Plantilla'} volverA={volverA}>
        {cargando ? (
          <Esqueleto filas={4} />
        ) : (
          <p className="profe-vacio">No encontramos esta {nombreTipo}.</p>
        )}
      </ProfeLayout>
    )
  }

  const esBorrador = esRutina && datos.publicada === false
  const bloques = agruparEnBloques(items)
  const grupos = datos.grupos_musculares || []
  const textoMusculos = grupos.length ? textoGrupos(grupos) : datos.musculos
  const pausa = textoRango(datos.pausa_min, datos.pausa_max)
  const mostrarKgObjetivo = !cliente || cliente.plan !== 'rutina'
  const ciclo = esRutina ? semanaDelCiclo(datos, obtenerFechaHoyISO()) : null
  const semanasCiclo = Number(datos.ciclo_semanas) || 0

  return (
    <ProfeLayout
      titulo={esBorrador ? 'Nueva rutina' : esRutina ? 'Editar rutina' : 'Editar plantilla'}
      volverA={volverA}
    >
      {cliente && (
        <p className="profe-nota">
          Para {cliente.nombre} {cliente.apellido}
          {esBorrador && ' · Borrador: todavía no la ve'}
        </p>
      )}

      {esBorrador && (
        <div className="asistente-pasos-pagina">
          <PasosAsistente pasos={PASOS_RUTINA} actual={2} etiqueta="Pasos para crear la rutina" />
        </div>
      )}

      {mensaje && <p className="auth-message">{mensaje}</p>}

      <div className="acciones-fila">
        <Link
          to={
            esRutina ? `/profe/rutinas/${id}/vista-previa` : `/profe/plantillas/${id}/vista-previa`
          }
          className="boton-secundario boton-chico"
        >
          <Icono nombre="ojo" /> Ver como alumno
        </Link>
        {esRutina && !esBorrador && (
          <Link to={`/profe/rutinas/${id}/dias`} className="boton-secundario boton-chico">
            Asignar días
          </Link>
        )}
        {!esBorrador && items.length > 0 && (
          <button
            type="button"
            className="boton-secundario boton-chico"
            onClick={() => setCopiandoAVarios(true)}
          >
            {esRutina ? 'Copiar a otros alumnos' : 'Dársela a varios alumnos'}
          </button>
        )}
      </div>

      {copiandoAVarios && (
        <CopiarAVariosAlumnos
          tipo={esRutina ? 'rutina' : 'plantilla'}
          origen={{ ...datos, id }}
          sinCliente={esRutina ? datos.cliente_id : null}
          onCerrar={() => setCopiandoAVarios(false)}
          onListo={({ copiadas, fallidas }) => {
            setCopiandoAVarios(false)
            avisarCopia(copiadas, fallidas)
          }}
        />
      )}

      <div className="rutina-vista">
        {/* Encabezado: nombre y grupos musculares */}
        <section className="rutina-vista-cabecera">
          {editando === 'datos' ? (
            <div className="editor-datos">
              <label className="editor-campo">
                <span>Nombre</span>
                <input
                  className="auth-input editor-datos-nombre"
                  type="text"
                  value={datosEdit.nombre}
                  onChange={(event) => setDatosEdit({ ...datosEdit, nombre: event.target.value })}
                />
              </label>
              <span className="editor-rango-etiqueta">Grupos musculares</span>
              <SelectorGrupos
                seleccionados={datosEdit.grupos}
                onCambiar={(lista) => setDatosEdit({ ...datosEdit, grupos: lista })}
              />
              <textarea
                className="form-textarea"
                placeholder="Descripción (opcional): objetivo de la rutina, indicaciones generales…"
                value={datosEdit.descripcion}
                onChange={(event) =>
                  setDatosEdit({ ...datosEdit, descripcion: event.target.value })
                }
              />
              <div className="editor-acciones">
                <button
                  type="button"
                  className="registro-boton-secundario"
                  onClick={() => setEditando(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="pill-button editor-boton-listo"
                  onClick={guardarDatos}
                >
                  Listo
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="rutina-vista-etiqueta">{esRutina ? 'Rutina' : 'Plantilla'}</p>
              <p className="rutina-detalle-titulo">{datos.nombre}</p>
              {textoMusculos && (
                <p className="rutina-grupos">
                  <strong>Grupos musculares:</strong> {textoMusculos}
                </p>
              )}
              {datos.descripcion && <p className="rutina-vista-descripcion">{datos.descripcion}</p>}
              <button
                type="button"
                className="profe-ejercicio-agregar"
                onClick={() => abrirEdicion('datos')}
                disabled={Boolean(editando)}
              >
                Editar nombre y grupos
              </button>
            </>
          )}
        </section>

        <SeccionActividadesEditable
          seccion="calentamiento"
          actividades={datos.calentamiento || []}
          editando={editando}
          onAbrir={() => abrirEdicion('calentamiento')}
          onGuardar={(lista) => guardarActividades('calentamiento', lista)}
          onCancelar={() => setEditando(null)}
        />

        {/* Ejercicios */}
        <section className="seccion-rutina seccion-rutina-ejercicios">
          <div className="seccion-rutina-cabecera">
            <p className="seccion-rutina-titulo">
              <Icono nombre="pesa" /> Ejercicios
            </p>
            {enCompu && bloques.length > 1 && (
              <span className="seccion-rutina-ayuda">
                <Icono nombre="arrastrar" /> Arrastrá los bloques para ordenarlos
              </span>
            )}
          </div>
          {bloques.length === 0 ? (
            <p className="profe-vacio">Todavía no hay ejercicios agregados.</p>
          ) : (
            bloques.map((bloque, indiceBloque) => (
              <div
                key={bloque.items[0].item.id || indiceBloque}
                className={[
                  'bloque-arrastrable',
                  arrastre.desde === indiceBloque ? 'bloque-arrastrando' : '',
                  arrastre.sobre === indiceBloque && arrastre.desde !== indiceBloque
                    ? 'bloque-destino'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                draggable={enCompu}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  setArrastre({ desde: indiceBloque, sobre: indiceBloque })
                }}
                onDragOver={(event) => {
                  if (arrastre.desde === null) return
                  event.preventDefault()
                  if (arrastre.sobre !== indiceBloque) {
                    setArrastre((actual) => ({ ...actual, sobre: indiceBloque }))
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  soltarBloque(indiceBloque)
                }}
                onDragEnd={() => setArrastre({ desde: null, sobre: null })}
                title={enCompu ? 'Arrastralo para cambiarlo de lugar' : undefined}
              >
                <BloqueProfe
                  bloque={bloque}
                  idsArchivados={idsArchivados}
                  semanasCiclo={semanasCiclo}
                  esPrimero={indiceBloque === 0}
                  esUltimo={indiceBloque === bloques.length - 1}
                  onMover={(direccion) => moverUnBloque(indiceBloque, direccion)}
                  onEditar={() =>
                    setAsistente({ indiceBloque, borrador: bloqueABorrador(bloque, semanasCiclo) })
                  }
                  onQuitar={() => quitarUnBloque(bloque, indiceBloque)}
                  onDuplicar={() => duplicarUnBloque(indiceBloque)}
                  onEditarCalentamiento={(posicion) =>
                    setAsistente({
                      indiceBloque,
                      borrador: bloqueABorrador(bloque, semanasCiclo),
                      calentamientoDe: posicion,
                    })
                  }
                />
              </div>
            ))
          )}
          <button
            type="button"
            className="profe-boton-agregar-ejercicio"
            onClick={() => setAsistente({ indiceBloque: null, borrador: null })}
          >
            + Agregar ejercicios
          </button>
        </section>

        {/* Pausa entre ejercicios */}
        <section className="seccion-rutina">
          <div className="seccion-rutina-cabecera">
            <p className="seccion-rutina-titulo">
              <Icono nombre="reloj" /> Pausa entre ejercicios
            </p>
            {editando !== 'pausa' && (
              <button
                type="button"
                className="profe-ejercicio-agregar"
                onClick={() => abrirEdicion('pausa')}
                disabled={Boolean(editando)}
              >
                {pausa ? 'Editar' : 'Configurar'}
              </button>
            )}
          </div>
          {editando === 'pausa' ? (
            <>
              <p className="profe-nota">
                Es la pausa al pasar de un ejercicio o bloque al siguiente. Es aparte del descanso
                entre series de cada ejercicio.
              </p>
              <EditorRango
                minimo={pausaEdit.min}
                maximo={pausaEdit.max}
                onCambiar={(min, max) => setPausaEdit({ min, max })}
              />
              <div className="editor-acciones">
                <button
                  type="button"
                  className="registro-boton-secundario"
                  onClick={() => setEditando(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="pill-button editor-boton-listo"
                  onClick={guardarPausa}
                >
                  Listo
                </button>
              </div>
            </>
          ) : (
            <p className={pausa ? 'seccion-rutina-valor' : 'profe-vacio'}>
              {pausa || 'Sin configurar'}
            </p>
          )}
        </section>

        {/* Ciclo: semanas y progresión */}
        <section className="seccion-rutina">
          <div className="seccion-rutina-cabecera">
            <p className="seccion-rutina-titulo">
              <Icono nombre="calendario" /> Ciclo por semanas
            </p>
            {editando !== 'ciclo' && (
              <button
                type="button"
                className="profe-ejercicio-agregar"
                onClick={() => abrirEdicion('ciclo')}
                disabled={Boolean(editando)}
              >
                {datos.ciclo_semanas ? 'Editar' : 'Configurar'}
              </button>
            )}
          </div>
          {editando === 'ciclo' ? (
            <>
              <p className="profe-nota">
                Elegí cuántas semanas dura el ciclo. Después, en cada ejercicio (Editar), poné
                cuánto sube por semana (ej. +2,5 kg) o armá cada semana distinta: la app le muestra
                al alumno lo de la semana que le toca.
              </p>
              <select
                className="profe-calendario-select"
                value={semanasEdit}
                onChange={(event) => setSemanasEdit(event.target.value)}
                aria-label="Duración del ciclo"
              >
                <option value="">Sin ciclo</option>
                {OPCIONES_SEMANAS.map((semanas) => (
                  <option key={semanas} value={semanas}>
                    {semanas} semanas
                  </option>
                ))}
              </select>
              <div className="editor-acciones">
                <button
                  type="button"
                  className="registro-boton-secundario"
                  onClick={() => setEditando(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="pill-button editor-boton-listo"
                  onClick={guardarCiclo}
                >
                  Listo
                </button>
              </div>
            </>
          ) : datos.ciclo_semanas ? (
            <>
              <p className="seccion-rutina-valor">
                {datos.ciclo_semanas} semanas
                {ciclo && datos.ciclo_inicio
                  ? ciclo.terminado
                    ? ` · terminó (empezó el ${textoFechaCorta(datos.ciclo_inicio)})`
                    : ` · semana ${ciclo.semana} de ${ciclo.total} (empezó el ${textoFechaCorta(datos.ciclo_inicio)})`
                  : esRutina
                    ? ' · empieza cuando guardes la rutina'
                    : ''}
              </p>
              {esRutina && datos.ciclo_inicio && (
                <button
                  type="button"
                  className={ciclo?.terminado ? 'boton-principal' : 'boton-secundario boton-chico'}
                  onClick={empezarCicloNuevo}
                  disabled={Boolean(editando)}
                >
                  Empezar ciclo nuevo
                </button>
              )}
            </>
          ) : (
            <p className="profe-vacio">Sin ciclo: el peso lo sugiere la app según cómo le fue.</p>
          )}
        </section>

        <SeccionActividadesEditable
          seccion="vuelta_calma"
          actividades={datos.vuelta_calma || []}
          editando={editando}
          onAbrir={() => abrirEdicion('vuelta_calma')}
          onGuardar={(lista) => guardarActividades('vuelta_calma', lista)}
          onCancelar={() => setEditando(null)}
        />
      </div>

      <div className="editor-guardar-rutina editor-guardar-fijo">
        <p className="profe-nota">
          {esBorrador
            ? 'Los cambios se guardan solos. Cuando esté lista, guardala: el cliente la va a ver y elegís qué días la hace.'
            : 'Los cambios se guardan solos, al momento.'}
        </p>
        <button
          type="button"
          className="boton-principal"
          onClick={finalizar}
          disabled={guardandoRutina || Boolean(editando)}
        >
          {guardandoRutina ? 'Guardando…' : esBorrador ? 'Guardar rutina y elegir días' : 'Listo'}
        </button>
      </div>

      {asistente && (
        <AsistenteBloque
          borradorInicial={asistente.borrador}
          grupos={grupos}
          biblioteca={biblioteca}
          mostrarKgObjetivo={mostrarKgObjetivo}
          semanasCiclo={semanasCiclo}
          calentamientoDe={asistente.calentamientoDe}
          onGuardar={guardarBloque}
          onCerrar={() => setAsistente(null)}
        />
      )}
      {hojaConfirmar}
    </ProfeLayout>
  )
}

// Calentamiento previo o vuelta a la calma, con su botón para editarlo.
function SeccionActividadesEditable({
  seccion,
  actividades,
  editando,
  onAbrir,
  onGuardar,
  onCancelar,
}) {
  const textos = SECCIONES_ACTIVIDADES[seccion]
  const abierta = editando === seccion
  return (
    <section className="seccion-rutina">
      <div className="seccion-rutina-cabecera">
        <p className="seccion-rutina-titulo">
          <Icono nombre={textos.icono} /> {textos.titulo}
        </p>
        {!abierta && actividades.length > 0 && (
          <button
            type="button"
            className="profe-ejercicio-agregar"
            onClick={onAbrir}
            disabled={Boolean(editando)}
          >
            Editar
          </button>
        )}
      </div>
      {abierta ? (
        <EditorActividades
          actividades={actividades}
          sugerencias={textos.sugerencias}
          conReloj={textos.conReloj}
          onGuardar={onGuardar}
          onCancelar={onCancelar}
        />
      ) : actividades.length > 0 ? (
        <SeccionActividades actividades={actividades} />
      ) : (
        <>
          <p className="profe-vacio">{textos.vacio}</p>
          <button
            type="button"
            className="profe-boton-agregar-ejercicio"
            onClick={onAbrir}
            disabled={Boolean(editando)}
          >
            {textos.boton}
          </button>
        </>
      )}
    </section>
  )
}
