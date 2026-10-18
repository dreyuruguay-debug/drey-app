import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import GraficoProgreso from '../components/GraficoProgreso.jsx'
import EditorEvaluacion from '../components/evaluacion/EditorEvaluacion.jsx'
import { supabase } from '../services/supabaseClient.js'
import { traerTodasLasFilas } from '../services/paginado.js'
import { actualizarDatosEvaluacion, generarResumenesPendientes } from '../services/progreso.js'
import { cargarMediciones } from '../services/medidas.js'
import { cargarAjustesDrive } from '../services/drive.js'
import {
  calcularEvaluacion,
  esEvaluacionCompleta,
  medidasDelPeriodo,
  mismosDatos,
} from '../utils/evaluacion.js'
import {
  ejerciciosEntrenados,
  progresoDeEjercicio,
  volumenPorSemana,
  formatearNumero,
  formatearCambio,
} from '../utils/progreso.js'
import Esqueleto from '../components/Esqueleto.jsx'
import { textoFechaCorta } from '../utils/dias.js'

// Progresión de un cliente, para el profe:
//   1. Evaluaciones mensuales (cada ciclo de 4 semanas): el profe las
//      revisa, las completa (medidas opcionales, notas, comentario,
//      objetivos), las publica para el alumno, descarga el PDF y lo
//      guarda en Google Drive (components/evaluacion/EditorEvaluacion.jsx).
//   2. Por ejercicio: carga máxima semana a semana (gráfico) y el
//      historial con la comparación contra la semana anterior.
//   3. Volumen total de entrenamiento por semana.
//
// Los borradores se muestran recalculados en el momento con todo el
// historial y las medidas de hoy; si cambiaron (un entrenamiento
// corregido, el formato anterior), se guardan solos. Lo que escribió el
// profe no se toca.
export default function ProfeClienteProgreso() {
  const { id } = useParams()
  const [cargando, setCargando] = useState(true)
  const [cliente, setCliente] = useState(null)
  const [nombreProfe, setNombreProfe] = useState('')
  const [sesiones, setSesiones] = useState([])
  const [mediciones, setMediciones] = useState([])
  const [resumenes, setResumenes] = useState([])
  const [ajustesDrive, setAjustesDrive] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const [ejercicioElegido, setEjercicioElegido] = useState('')

  useEffect(() => {
    cargar()
  }, [id])

  async function cargar({ silencioso = false } = {}) {
    if (!silencioso) setCargando(true)
    await generarResumenesPendientes()
    const [
      { data: perfil },
      { data: listaSesiones },
      { data: listaResumenes },
      { mediciones: listaMediciones },
      drive,
    ] = await Promise.all([
      supabase.from('perfiles').select('id, nombre, apellido, profe_id').eq('id', id).single(),
      traerTodasLasFilas(() =>
        supabase
          .from('sesiones')
          .select('id, fecha, esfuerzo, detalle')
          .eq('cliente_id', id)
          .order('fecha')
          .order('id'),
      ),
      supabase
        .from('resumenes_progreso')
        .select('*')
        .eq('cliente_id', id)
        .order('ciclo', { ascending: false }),
      cargarMediciones(id),
      cargarAjustesDrive(),
    ])
    const lista = listaResumenes || []
    setCliente(perfil || null)
    setSesiones(listaSesiones || [])
    setMediciones(listaMediciones || [])
    setResumenes(lista)
    setAjustesDrive(drive)
    // Abierta: la que se estaba mirando o el primer borrador (si no, la última).
    setAbierta(
      (actual) =>
        (lista.some((r) => r.id === actual) && actual) ||
        lista.find((r) => r.estado !== 'publicado')?.id ||
        lista[0]?.id ||
        null,
    )
    setNombreProfe(await nombreDelProfe(perfil?.profe_id))
    setCargando(false)
  }

  const nombreCliente = cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Cliente'

  // La evaluación de cada borrador, recalculada con todo lo de hoy.
  const evaluacionesVivas = useMemo(() => {
    const vivas = {}
    for (const resumen of resumenes) {
      if (resumen.estado === 'publicado' && esEvaluacionCompleta(resumen.datos)) continue
      vivas[resumen.id] = {
        ...calcularEvaluacion(sesiones, resumen.desde, resumen.hasta),
        medidas: medidasDelPeriodo(mediciones, resumen.desde, resumen.hasta),
      }
    }
    return vivas
  }, [resumenes, sesiones, mediciones])

  // Si los números cambiaron, se guardan solos (sin tocar las notas).
  useEffect(() => {
    for (const resumen of resumenes) {
      const viva = evaluacionesVivas[resumen.id]
      if (!viva) continue
      if (mismosDatos(resumen.datos, viva)) continue
      const conNombres = {
        ...viva,
        nombreAlumno: resumen.datos?.nombreAlumno || (cliente ? nombreCliente : undefined),
        nombreProfe: resumen.datos?.nombreProfe || nombreProfe || undefined,
      }
      actualizarDatosEvaluacion(resumen.id, conNombres)
    }
  }, [evaluacionesVivas])

  const ejercicios = useMemo(() => ejerciciosEntrenados(sesiones), [sesiones])
  const elegido = ejercicioElegido || ejercicios[0]?.ejercicio_id || ''
  const historial = useMemo(
    () => (elegido ? progresoDeEjercicio(sesiones, elegido) : []),
    [sesiones, elegido],
  )
  const volumen = useMemo(() => volumenPorSemana(sesiones), [sesiones])

  return (
    <ProfeLayout
      titulo={`Progresión · ${nombreCliente}`}
      volverA={`/profe/clientes/${id}?tab=progreso`}
    >
      {!cargando && (
        <SeccionEvaluaciones
          resumenes={resumenes}
          evaluacionesVivas={evaluacionesVivas}
          abierta={abierta}
          onAbrir={(idResumen) => setAbierta((actual) => (actual === idResumen ? null : idResumen))}
          alumnoId={id}
          nombreAlumno={cliente ? nombreCliente : ''}
          nombreProfe={nombreProfe}
          ajustesDrive={ajustesDrive}
          onCambio={() => cargar({ silencioso: true })}
        />
      )}

      {cargando ? (
        <Esqueleto />
      ) : sesiones.length === 0 ? (
        <p className="profe-vacio">
          Todavía no completó ninguna rutina. Las gráficas aparecen con el primer entrenamiento.
        </p>
      ) : (
        <>
          <p className="profe-seccion-label">Carga por ejercicio</p>
          <select
            className="profe-calendario-select progreso-selector"
            value={elegido}
            onChange={(event) => setEjercicioElegido(event.target.value)}
            aria-label="Elegir ejercicio"
          >
            {ejercicios.map((ejercicio) => (
              <option key={ejercicio.ejercicio_id} value={ejercicio.ejercicio_id}>
                {ejercicio.nombre}
              </option>
            ))}
          </select>

          <GraficoProgreso
            titulo="Carga máxima por semana"
            unidad=" kg"
            puntos={historial.map((fila) => ({
              etiqueta: etiquetaSemana(fila.semana),
              valor: fila.kgMax,
            }))}
          />

          <div className="profe-tabla-wrap">
            <table className="profe-tabla">
              <thead>
                <tr>
                  <th>Semana</th>
                  <th>Mejor serie</th>
                  <th>Volumen</th>
                  <th>vs. anterior</th>
                </tr>
              </thead>
              <tbody>
                {[...historial].reverse().map((fila) => (
                  <tr key={fila.semana}>
                    <td>{etiquetaSemana(fila.semana)}</td>
                    <td>
                      {formatearNumero(fila.mejorSerie.kg)} kg × {fila.mejorSerie.reps}
                    </td>
                    <td>{formatearNumero(fila.volumen)} kg</td>
                    <td className={claseCambio(fila.cambioKg)}>{formatearCambio(fila.cambioKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="profe-seccion-label">Volumen total por semana</p>
          <GraficoProgreso
            tipo="barras"
            titulo="Volumen de entrenamiento (kg × reps)"
            puntos={volumen.map((fila) => ({
              etiqueta: etiquetaSemana(fila.semana),
              valor: Math.round(fila.volumen),
            }))}
          />
        </>
      )}
    </ProfeLayout>
  )
}

// Las evaluaciones del alumno, de la más nueva a la más vieja; se abre
// de a una.
function SeccionEvaluaciones({
  resumenes,
  evaluacionesVivas,
  abierta,
  onAbrir,
  alumnoId,
  nombreAlumno,
  nombreProfe,
  ajustesDrive,
  onCambio,
}) {
  return (
    <section className="evaluaciones-lista">
      <p className="profe-seccion-label">Evaluaciones mensuales</p>
      {resumenes.length === 0 ? (
        <p className="profe-vacio">
          La primera evaluación aparece sola cuando se cumplan 4 semanas desde su primer
          entrenamiento.
        </p>
      ) : (
        resumenes.map((resumen) => {
          const publicada = resumen.estado === 'publicado'
          return (
            <div key={resumen.id} className="resumen-caja">
              <button
                type="button"
                className="evaluacion-desplegar"
                aria-expanded={abierta === resumen.id}
                onClick={() => onAbrir(resumen.id)}
              >
                <span>
                  <strong>Ciclo {resumen.ciclo}</strong> · {textoFechaCorta(resumen.desde)} al{' '}
                  {textoFechaCorta(resumen.hasta)}
                </span>
                <span
                  className={
                    publicada ? 'resumen-estado resumen-estado-publicado' : 'resumen-estado'
                  }
                >
                  {publicada
                    ? `Publicada${resumen.visto ? ' · ya la vio' : ''}`
                    : 'Borrador: revisala y publicala'}
                </span>
                <span className="avance-flecha" aria-hidden="true">
                  {abierta === resumen.id ? '▲' : '▼'}
                </span>
              </button>
              {abierta === resumen.id && (
                <EditorEvaluacion
                  key={resumen.id}
                  resumen={resumen}
                  datosVivos={evaluacionesVivas[resumen.id] || null}
                  alumnoId={alumnoId}
                  nombreAlumno={nombreAlumno}
                  nombreProfe={nombreProfe}
                  ajustesDrive={ajustesDrive}
                  onCambio={onCambio}
                />
              )}
            </div>
          )
        })
      )}
    </section>
  )
}

// Nombre del profe del alumno (para la cabecera de la evaluación).
async function nombreDelProfe(profeId) {
  if (!profeId) return ''
  const { data } = await supabase
    .from('perfiles')
    .select('nombre, apellido')
    .eq('id', profeId)
    .maybeSingle()
  return data ? `${data.nombre || ''} ${data.apellido || ''}`.trim() : ''
}

function etiquetaSemana(lunesISO) {
  const fecha = new Date(`${lunesISO}T00:00:00`)
  return `${fecha.getDate()}/${fecha.getMonth() + 1}`
}

function claseCambio(cambio) {
  if (cambio == null || cambio === 0) return ''
  return cambio > 0 ? 'resumen-sube' : 'resumen-baja'
}
