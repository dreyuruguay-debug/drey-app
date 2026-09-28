import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import DescargarPlanilla from '../components/planilla/DescargarPlanilla.jsx'
import MensajesPlanilla from '../components/planilla/MensajesPlanilla.jsx'
import ResolverEjercicios from '../components/planilla/ResolverEjercicios.jsx'
import VistaPreviaDia from '../components/planilla/VistaPreviaDia.jsx'
import { cargarBiblioteca } from '../services/biblioteca.js'
import { cargarRutinasParaPlanilla, guardarPrograma } from '../services/programas.js'
import { crearArchivoDePlanilla, leerArchivoDePlanilla } from '../services/planillaExcel.js'
import { CAMPOS_EJERCICIO } from '../services/rutinas.js'
import { mostrarAviso } from '../services/avisos.js'
import { MAXIMO_MEGAS } from '../data/planillaExcel.js'
import { contenidoDePlanilla, programaVacio } from '../utils/exportarPlanilla.js'
import { analizarPlanilla } from '../utils/importarPlanilla.js'
import { planDeGuardado, programaDesdeRutinas } from '../utils/programa.js'
import { obtenerFechaHoyISO } from '../utils/dias.js'

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// "Rutinas en Excel" de un cliente (ficha del cliente → Rutinas).
//
//   1. Descargar la planilla oficial: con sus rutinas (para modificarlas)
//      o vacía (para armar de cero).
//   2. Subirla: la app la revisa celda por celda sin tocar nada todavía.
//   3. Revisar: problemas para corregir, avisos, ejercicios que no están
//      en la biblioteca (vincular o crear) y cómo queda cada día.
//   4. Importar: crea o actualiza las rutinas (sin duplicar: cada rutina
//      y cada ejercicio de la planilla lleva su ID).
//
// La planilla es otra forma de ver el mismo modelo de la app (ver
// utils/programa.js): una rutina importada se sigue editando en la app, y
// una de la app se puede bajar, cambiar y volver a subir.
export default function ProfeExcel() {
  const { id } = useParams()
  const hoy = obtenerFechaHoyISO()
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [cliente, setCliente] = useState(null)
  const [actuales, setActuales] = useState([])
  const [biblioteca, setBiblioteca] = useState([])

  const [descargando, setDescargando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [archivo, setArchivo] = useState(null)
  const [resoluciones, setResoluciones] = useState({})
  const [destinos, setDestinos] = useState({})
  const [reiniciarCiclo, setReiniciarCiclo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState(null)
  // Lo que ya se guardó en un intento que se cortó (para no duplicar).
  const previo = useRef({})
  const entrada = useRef(null)

  useEffect(() => {
    cargar()
  }, [id])

  async function cargar({ silencioso = false } = {}) {
    if (!silencioso) setCargando(true)
    const [datos, { ejercicios }] = await Promise.all([
      cargarRutinasParaPlanilla(id),
      cargarBiblioteca(),
    ])
    if (datos.error || !datos.cliente) {
      setErrorCarga(
        'No pudimos cargar las rutinas del cliente. Revisá tu conexión y probá de nuevo.',
      )
    } else {
      setErrorCarga('')
      setCliente(datos.cliente)
      setActuales(datos.actuales)
    }
    setBiblioteca(ejercicios || [])
    setCargando(false)
  }

  const datosCliente = cliente ? { id, nombre: cliente.nombreCompleto } : null
  const analisis = useMemo(
    () =>
      archivo && datosCliente
        ? analizarPlanilla(archivo.libro, {
            biblioteca,
            cliente: datosCliente,
            actuales,
            resoluciones,
            destinos,
          })
        : null,
    [archivo, biblioteca, cliente, actuales, resoluciones, destinos],
  )
  const sinErrores = Boolean(analisis?.programa) && analisis.errores.length === 0
  const plan = useMemo(
    () =>
      sinErrores
        ? planDeGuardado(analisis.programa, actuales, {
            campos: CAMPOS_EJERCICIO,
            hoy,
            reiniciarCiclo,
          })
        : null,
    [analisis, actuales, reiniciarCiclo],
  )

  // --- Descargar ---

  async function descargar({ rutinaIds, semanas, dias }) {
    setDescargando(true)
    setMensaje('')
    try {
      const programa = dias
        ? programaVacio(datosCliente, dias, semanas)
        : programaDesdeRutinas({
            cliente: datosCliente,
            rutinas: actuales.filter(({ rutina }) => rutinaIds.includes(rutina.id)),
            semanas,
          })
      const bytes = await crearArchivoDePlanilla(contenidoDePlanilla(programa, biblioteca))
      bajarArchivo(bytes, nombreDeArchivo(cliente.nombreCompleto, hoy))
    } catch {
      setMensaje('No pudimos armar la planilla. Revisá tu conexión y probá de nuevo.')
    }
    setDescargando(false)
  }

  // --- Subir ---

  async function elegirArchivo(event) {
    const elegido = event.target.files?.[0]
    event.target.value = ''
    if (!elegido) return
    setMensaje('')
    setResultado(null)
    setResoluciones({})
    setDestinos({})
    setReiniciarCiclo(false)
    previo.current = {}
    if (elegido.size > MAXIMO_MEGAS * 1024 * 1024) {
      setArchivo(null)
      setMensaje(`El archivo pesa más de ${MAXIMO_MEGAS} MB: no parece la planilla de rutinas.`)
      return
    }
    setLeyendo(true)
    try {
      const libro = await leerArchivoDePlanilla(await elegido.arrayBuffer())
      setArchivo({ nombre: elegido.name, libro })
    } catch (error) {
      setArchivo(null)
      setMensaje(
        error?.message?.startsWith('No pudimos abrir')
          ? error.message
          : 'No pudimos leer el archivo. Revisá tu conexión y probá de nuevo.',
      )
    }
    setLeyendo(false)
  }

  function resolver(clave, resolucion) {
    setResoluciones((actual) => {
      const nuevas = { ...actual }
      if (resolucion) nuevas[clave] = resolucion
      else delete nuevas[clave]
      return nuevas
    })
  }

  // --- Importar ---

  async function importar() {
    setGuardando(true)
    setMensaje('')
    const respuesta = await guardarPrograma({
      programa: analisis.programa,
      clienteId: id,
      hoy,
      reiniciarCiclo,
      previo: previo.current,
    })
    previo.current = respuesta.previo
    setGuardando(false)
    setResultado(respuesta)
    if (!respuesta.error) {
      mostrarAviso('Rutinas importadas')
      cargar({ silencioso: true })
    }
  }

  function empezarDeNuevo() {
    setArchivo(null)
    setResultado(null)
    setResoluciones({})
    setDestinos({})
    previo.current = {}
  }

  const volverA = `/profe/clientes/${id}?tab=rutinas`
  if (cargando || errorCarga) {
    return (
      <ProfeLayout titulo="Rutinas en Excel" volverA={volverA}>
        {cargando ? <Esqueleto filas={3} /> : <p className="auth-message">{errorCarga}</p>}
      </ProfeLayout>
    )
  }

  const listo = resultado && !resultado.error
  const dias = analisis?.programa?.dias || []
  const planPorDia = new Map((plan || []).map((dia) => [dia.numero, dia]))
  const sinCambios =
    plan?.length > 0 &&
    plan.every(
      (dia) =>
        dia.accion === 'actualizar' &&
        !dia.datosCambian &&
        !dia.cambios.insertar &&
        !dia.cambios.actualizar &&
        !dia.cambios.borrar,
    )
  // Días que ya venían con un ciclo empezado: se puede seguir o empezar de nuevo.
  const cicloEnCurso = (plan || []).some(
    (dia) => dia.ciclo.despues && dia.ciclo.inicioAntes && dia.ciclo.inicioAntes !== hoy,
  )

  return (
    <ProfeLayout titulo="Rutinas en Excel" volverA={volverA}>
      <p className="profe-nota">
        Para {cliente.nombreCompleto}. Armá o cambiá sus rutinas en Excel o Google Sheets: la
        planilla es la misma rutina que ves en la app, así que podés bajarla, modificarla y volver a
        subirla sin duplicar nada.
      </p>

      {mensaje && (
        <p className="auth-message planilla-mensaje" role="alert">
          {mensaje}
        </p>
      )}

      {listo ? (
        <Resultado
          resultado={resultado}
          nombre={cliente.nombre}
          volverA={volverA}
          onOtra={empezarDeNuevo}
        />
      ) : (
        <>
          <DescargarPlanilla
            actuales={actuales}
            descargando={descargando}
            onDescargar={descargar}
          />

          <section className="seccion-rutina planilla-paso">
            <p className="planilla-paso-titulo">2. Subir la planilla</p>
            <p className="profe-nota planilla-nota">
              Cuando termines, guardala como Excel (.xlsx) y subila. Antes de cambiar nada te
              mostramos lo que encontramos. En Google Sheets: Archivo → Descargar → Microsoft Excel.
            </p>
            <input
              ref={entrada}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="planilla-archivo"
              onChange={elegirArchivo}
              aria-label="Elegir la planilla (.xlsx)"
            />
            <button
              type="button"
              className={archivo ? 'boton-secundario' : 'boton-principal'}
              disabled={leyendo || guardando}
              onClick={() => entrada.current?.click()}
            >
              {leyendo
                ? 'Revisando la planilla…'
                : archivo
                  ? '⬆ Subir otra vez (corregida)'
                  : '⬆ Elegir la planilla (.xlsx)'}
            </button>
            {archivo && <p className="planilla-archivo-nombre">📄 {archivo.nombre}</p>}
          </section>

          {analisis && (
            <section className="seccion-rutina planilla-paso">
              <p className="planilla-paso-titulo">3. Revisar</p>
              {analisis.programa && (
                <div className="chips-lista">
                  <span className="chip chip-dato chip-chico">
                    {dias.length === 1 ? '1 día' : `${dias.length} días`}
                  </span>
                  <span className="chip chip-dato chip-chico">
                    {analisis.programa.semanas === 1
                      ? '1 semana'
                      : `${analisis.programa.semanas} semanas`}
                  </span>
                  <span className="chip chip-dato chip-chico">
                    {dias.reduce(
                      (total, dia) =>
                        total +
                        dia.bloques.reduce((suma, bloque) => suma + bloque.ejercicios.length, 0),
                      0,
                    )}{' '}
                    ejercicios
                  </span>
                </div>
              )}

              <MensajesPlanilla tipo="error" mensajes={analisis.errores} />
              <ResolverEjercicios
                desconocidos={analisis.desconocidos}
                resoluciones={resoluciones}
                biblioteca={biblioteca}
                onResolver={resolver}
              />
              <MensajesPlanilla tipo="aviso" mensajes={analisis.advertencias} />

              {dias.map((dia) => {
                const usadas = dias
                  .filter((otro) => otro.numero !== dia.numero && otro.rutinaId)
                  .map((otro) => otro.rutinaId)
                return (
                  <VistaPreviaDia
                    key={dia.numero}
                    dia={dia}
                    semanas={analisis.programa.semanas}
                    plan={planPorDia.get(dia.numero) || null}
                    destino={analisis.destinos[dia.numero]}
                    opcionesDestino={actuales.filter(({ rutina }) => !usadas.includes(rutina.id))}
                    onDestino={(valor) =>
                      setDestinos((actual) => ({ ...actual, [dia.numero]: valor }))
                    }
                  />
                )
              })}

              {cicloEnCurso && (
                <label className="planilla-reiniciar">
                  <input
                    type="checkbox"
                    checked={reiniciarCiclo}
                    onChange={(event) => setReiniciarCiclo(event.target.checked)}
                  />
                  <span>
                    Empezar el ciclo de nuevo esta semana (semana 1). Si no, sigue en la semana que
                    va.
                  </span>
                </label>
              )}

              <div className="editor-guardar-rutina">
                {resultado?.error && (
                  <p className="auth-message" role="alert">
                    {resultado.error} Lo que ya se guardó no se repite: podés volver a tocar
                    "Importar".
                  </p>
                )}
                <p className="profe-nota planilla-nota">
                  {!sinErrores
                    ? 'Corregí los problemas en la planilla y subila de nuevo (los ejercicios para revisar se resuelven acá).'
                    : sinCambios
                      ? 'La planilla es igual a lo que ya está en la app.'
                      : `${cliente.nombre} ve los cambios apenas importes. Lo que no está en la planilla no se toca.`}
                </p>
                <button
                  type="button"
                  className="boton-principal"
                  disabled={!sinErrores || guardando}
                  onClick={importar}
                >
                  {guardando ? 'Importando…' : 'Importar a la app'}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </ProfeLayout>
  )
}

// Paso 4: lo que se guardó, con acceso a cada rutina.
function Resultado({ resultado, nombre, volverA, onOtra }) {
  const creadas = resultado.dias.filter((dia) => dia.accion === 'crear').length
  const actualizadas = resultado.dias.length - creadas
  const partes = []
  if (actualizadas)
    partes.push(
      `se ${actualizadas === 1 ? 'actualizó 1 rutina' : `actualizaron ${actualizadas} rutinas`}`,
    )
  if (creadas)
    partes.push(`se ${creadas === 1 ? 'creó 1 rutina nueva' : `crearon ${creadas} rutinas nuevas`}`)
  return (
    <section className="seccion-rutina planilla-paso planilla-listo">
      <p className="planilla-paso-titulo">✓ Listo</p>
      <p className="planilla-listo-texto">
        {partes.join(' y ').replace(/^./, (letra) => letra.toUpperCase())}. {nombre} ya lo ve en su
        app.
      </p>
      <ul className="planilla-listo-lista">
        {resultado.dias.map((dia) => (
          <li key={dia.numero}>
            <span>
              Día {dia.numero} · <strong>{dia.nombre}</strong>
              {dia.accion === 'crear' && (
                <span className="estado-chip estado-ok estado-chip-chico">Nueva</span>
              )}
            </span>
            <span className="acciones-fila">
              <Link to={`/profe/rutinas/${dia.rutinaId}`} className="boton-secundario boton-chico">
                Ver
              </Link>
              {dia.accion === 'crear' && (
                <Link
                  to={`/profe/rutinas/${dia.rutinaId}/dias`}
                  className="boton-secundario boton-chico"
                >
                  Elegir días
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
      {creadas > 0 && (
        <p className="profe-nota planilla-nota">
          A las rutinas nuevas falta decirles qué días de la semana las hace ("Elegir días").
        </p>
      )}
      <div className="acciones-columna">
        <Link to={volverA} className="boton-principal">
          Volver a las rutinas de {nombre}
        </Link>
        <button type="button" className="boton-secundario" onClick={onOtra}>
          Subir otra planilla
        </button>
      </div>
    </section>
  )
}

function bajarArchivo(bytes, nombre) {
  const url = URL.createObjectURL(new Blob([bytes], { type: TIPO_XLSX }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// "DREY - Rutinas de Juan Perez - 2026-09-28.xlsx": sin tildes ni
// caracteres que Windows no acepta (algunos navegadores cambian el nombre
// por "download" si tiene tildes).
function nombreDeArchivo(nombre, hoy) {
  const limpio = String(nombre || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]+/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `DREY - Rutinas de ${limpio} - ${hoy}.xlsx`
}
