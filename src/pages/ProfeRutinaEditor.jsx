import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  moverBloque,
  quitarBloque,
  reemplazarBloque,
} from '../utils/bloques.js'
import { textoRango } from '../utils/formatos.js'
import { textoGrupos } from '../data/gruposMusculares.js'
import { SECCIONES_ACTIVIDADES } from '../data/actividades.js'
import { PASOS_RUTINA } from '../data/asistente.js'

const ERROR_GUARDAR = 'No pudimos guardar el cambio. Revisá tu conexión y probá de nuevo.'

// Paso 3 del asistente: la rutina (o plantilla) armada tal como la va a
// ver el cliente, con los controles del profe en cada parte:
//
//   Rutina: nombre · grupos musculares          [Editar datos]
//   🔥 Calentamiento previo                      [Configurar]
//   Ejercicios (bloques numerados)  [↑ ↓ Editar Quitar] + Agregar ejercicios
//   ⏱️ Pausa entre ejercicios                    [Configurar]
//   🧘 Vuelta a la calma (opcional)              [Agregar]
//   [Guardar rutina]
//
// Cada cambio se guarda solo, al momento. Una rutina nueva queda en
// borrador (el cliente no la ve) hasta que se toca "Guardar rutina".
//
// tipo = 'rutina'    → /profe/rutinas/:id
// tipo = 'plantilla' → /profe/plantillas/:id
export default function ProfeRutinaEditor({ tipo }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const esRutina = tipo === 'rutina'
  const nombreTipo = esRutina ? 'rutina' : 'plantilla'

  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(null)
  const [items, setItems] = useState([])
  const [biblioteca, setBiblioteca] = useState([])
  const [cliente, setCliente] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [guardandoRutina, setGuardandoRutina] = useState(false)

  // Qué parte se está editando: 'datos', 'calentamiento', 'pausa' o
  // 'vuelta_calma' (una a la vez, para no mostrar todo junto).
  const [editando, setEditando] = useState(null)
  const [datosEdit, setDatosEdit] = useState(null)
  const [pausaEdit, setPausaEdit] = useState({ min: '', max: '' })

  // Asistente de bloque abierto: { indiceBloque, borrador } (indiceBloque
  // null = bloque nuevo).
  const [asistente, setAsistente] = useState(null)

  useEffect(() => {
    cargar()
  }, [tipo, id])

  async function cargar() {
    setCargando(true)
    const [{ datos: rutina, ejercicios }, { data: listaBiblioteca }] = await Promise.all([
      cargarRutinaCompleta(tipo, id),
      supabase.from('ejercicios').select('*').order('nombre'),
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

  // --- Bloques de ejercicios ---

  // Guarda la lista nueva de ejercicios y la vuelve a leer (así los
  // ejercicios recién agregados tienen su id). Devuelve un texto de
  // error, o '' si salió bien.
  async function aplicarLista(nuevaLista) {
    const anteriores = items
    setItems(nuevaLista)
    const error = await sincronizarEjercicios(tipo, id, anteriores, nuevaLista)
    setItems(await cargarEjercicios(tipo, id))
    return error ? ERROR_GUARDAR : ''
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

  async function quitarUnBloque(bloque, indiceBloque) {
    const nombres = bloque.items.map(({ item }) => item.ejercicios?.nombre).join(' + ')
    if (!window.confirm(`¿Quitar "${nombres}" de la ${nombreTipo}?`)) return
    setMensaje(await aplicarLista(quitarBloque(items, indiceBloque)))
  }

  // --- Guardar rutina ---

  const volverA = esRutina
    ? datos?.cliente_id
      ? `/profe/rutinas?cliente=${datos.cliente_id}`
      : '/profe/rutinas'
    : '/profe/plantillas'

  async function finalizar() {
    if (items.length === 0) {
      setMensaje(`Agregá al menos un ejercicio antes de guardar la ${nombreTipo}.`)
      return
    }
    if (esRutina && datos.publicada === false) {
      setGuardandoRutina(true)
      const ok = await guardarCampos({ publicada: true })
      setGuardandoRutina(false)
      if (!ok) return
    }
    navigate(volverA)
  }

  if (cargando || !datos) {
    return (
      <ProfeLayout titulo={esRutina ? 'Rutina' : 'Plantilla'} volverA={volverA}>
        <p className="profe-vacio">
          {cargando ? 'Cargando…' : `No encontramos esta ${nombreTipo}.`}
        </p>
      </ProfeLayout>
    )
  }

  const esBorrador = esRutina && datos.publicada === false
  const bloques = agruparEnBloques(items)
  const grupos = datos.grupos_musculares || []
  const textoMusculos = grupos.length ? textoGrupos(grupos) : datos.musculos
  const pausa = textoRango(datos.pausa_min, datos.pausa_max)
  const mostrarKgObjetivo = !cliente || cliente.plan !== 'rutina'

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
        <section className="seccion-rutina">
          <div className="seccion-rutina-cabecera">
            <p className="seccion-rutina-titulo">💪 Ejercicios</p>
          </div>
          {bloques.length === 0 ? (
            <p className="profe-vacio">Todavía no hay ejercicios agregados.</p>
          ) : (
            bloques.map((bloque, indiceBloque) => (
              <BloqueProfe
                key={bloque.items[0].item.id || indiceBloque}
                bloque={bloque}
                esPrimero={indiceBloque === 0}
                esUltimo={indiceBloque === bloques.length - 1}
                onMover={(direccion) => moverUnBloque(indiceBloque, direccion)}
                onEditar={() => setAsistente({ indiceBloque, borrador: bloqueABorrador(bloque) })}
                onQuitar={() => quitarUnBloque(bloque, indiceBloque)}
              />
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
            <p className="seccion-rutina-titulo">⏱️ Pausa entre ejercicios</p>
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

        <SeccionActividadesEditable
          seccion="vuelta_calma"
          actividades={datos.vuelta_calma || []}
          editando={editando}
          onAbrir={() => abrirEdicion('vuelta_calma')}
          onGuardar={(lista) => guardarActividades('vuelta_calma', lista)}
          onCancelar={() => setEditando(null)}
        />
      </div>

      <div className="editor-guardar-rutina">
        <p className="profe-nota">
          {esBorrador
            ? 'Los cambios se guardan solos. Tocá "Guardar rutina" cuando esté lista y el cliente la va a ver.'
            : 'Los cambios se guardan solos, al momento.'}
        </p>
        <button
          type="button"
          className="pill-button"
          onClick={finalizar}
          disabled={guardandoRutina || Boolean(editando)}
        >
          {guardandoRutina ? 'Guardando…' : esBorrador ? 'Guardar rutina' : 'Listo'}
        </button>
      </div>

      {asistente && (
        <AsistenteBloque
          borradorInicial={asistente.borrador}
          grupos={grupos}
          biblioteca={biblioteca}
          mostrarKgObjetivo={mostrarKgObjetivo}
          onGuardar={guardarBloque}
          onCerrar={() => setAsistente(null)}
        />
      )}
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
          {textos.icono} {textos.titulo}
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
