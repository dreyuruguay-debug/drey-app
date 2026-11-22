import { useEffect, useMemo, useState } from 'react'
import EvaluacionAnual from './EvaluacionAnual.jsx'
import BotonPdf from './BotonPdf.jsx'
import {
  cargarEvaluacionesAnuales,
  despublicarEvaluacionAnual,
  guardarEvaluacionAnual,
} from '../../services/evaluacionAnual.js'
import { mostrarAviso } from '../../services/avisos.js'
import {
  aniosConEntrenamientos,
  calcularEvaluacionAnual,
  esEvaluacionAnual,
  nombreArchivoEvaluacionAnual,
} from '../../utils/evaluacionAnual.js'
import { obtenerFechaHoyISO } from '../../utils/dias.js'

const MAXIMO_LETRAS = 2000

// "Evaluación del año" de un alumno, para el profe (ficha → Progreso →
// Evaluaciones y gráficas). Elige el año, ve todo armado solo con los
// entrenamientos y las medidas, escribe su comentario y los objetivos
// para el año que viene, y la publica para el alumno. También baja el PDF.
//
//   · Borrador: los números se recalculan cada vez con lo de hoy.
//   · Publicada: queda fija, como la vio el alumno. Para actualizarla,
//     "Dejar de publicar", revisar y volver a publicar.
//   sesiones: todos los entrenamientos del alumno. mediciones: sus medidas.
export default function EditorEvaluacionAnual({
  clienteId,
  nombreAlumno,
  nombreProfe,
  sesiones,
  mediciones,
}) {
  const hoy = obtenerFechaHoyISO()
  const anios = useMemo(() => aniosConEntrenamientos(sesiones), [sesiones])
  const [anio, setAnio] = useState(() => anios[0] || Number(hoy.slice(0, 4)))
  const [abierta, setAbierta] = useState(false)
  const [guardadas, setGuardadas] = useState([])
  const [faltaInstalar, setFaltaInstalar] = useState(false)
  const [comentario, setComentario] = useState('')
  const [objetivos, setObjetivos] = useState('')
  const [ocupado, setOcupado] = useState('')

  useEffect(() => {
    cargarEvaluacionesAnuales(clienteId).then(({ evaluaciones, error }) => {
      setGuardadas(evaluaciones)
      setFaltaInstalar(Boolean(error))
    })
  }, [clienteId])

  const guardada = guardadas.find((evaluacion) => evaluacion.anio === anio) || null
  const publicada = guardada?.estado === 'publicado'

  // Al cambiar de año (o al llegar lo guardado), los textos del profe.
  useEffect(() => {
    setComentario(guardada?.comentario_profe || '')
    setObjetivos(guardada?.objetivos || '')
  }, [guardada?.id, anio])

  // (Con los nombres adentro: así el alumno y su PDF los muestran.)
  const datosDeHoy = useMemo(
    () => ({
      ...calcularEvaluacionAnual(sesiones, mediciones, anio, hoy),
      nombreAlumno: nombreAlumno || undefined,
      nombreProfe: nombreProfe || undefined,
    }),
    [sesiones, mediciones, anio, hoy, nombreAlumno, nombreProfe],
  )
  // Publicada: lo que quedó guardado. Borrador: lo de hoy.
  const datos = publicada && esEvaluacionAnual(guardada.datos) ? guardada.datos : datosDeHoy
  const vistaPrevia = { anio, datos, comentario_profe: comentario, objetivos }

  function reemplazar(evaluacion) {
    setGuardadas((lista) => [
      evaluacion,
      ...lista.filter((otra) => otra.id !== evaluacion.id && otra.anio !== evaluacion.anio),
    ])
  }

  async function guardar(publicar) {
    setOcupado(publicar ? 'publicando' : 'guardando')
    const resultado = await guardarEvaluacionAnual({
      clienteId,
      anio,
      datos: datosDeHoy,
      comentario,
      objetivos,
      publicar,
    })
    setOcupado('')
    if (resultado.error) {
      mostrarAviso('No pudimos guardar la evaluación. Probá de nuevo.', 'error')
      return
    }
    reemplazar(resultado.evaluacion)
    mostrarAviso(publicar ? 'Evaluación publicada: el alumno ya la ve ✓' : 'Borrador guardado ✓')
  }

  async function despublicar() {
    setOcupado('despublicando')
    const resultado = await despublicarEvaluacionAnual(guardada.id)
    setOcupado('')
    if (resultado.error) {
      mostrarAviso('No pudimos cambiarla. Probá de nuevo.', 'error')
      return
    }
    reemplazar(resultado.evaluacion)
    mostrarAviso('Volvió a borrador: el alumno ya no la ve')
  }

  if (anios.length === 0) return null

  return (
    <section className="evaluaciones-lista evaluacion-anual">
      <p className="profe-seccion-label">Evaluación del año</p>
      <div className="resumen-caja">
        <div className="evaluacion-anual-cabecera">
          <label className="editor-campo">
            <span>Año</span>
            <select
              className="profe-calendario-select"
              value={anio}
              onChange={(event) => setAnio(Number(event.target.value))}
            >
              {anios.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </select>
          </label>
          <span
            className={publicada ? 'resumen-estado resumen-estado-publicado' : 'resumen-estado'}
          >
            {publicada
              ? `Publicada${guardada.visto ? ' · ya la vio' : ''}`
              : guardada
                ? 'Borrador guardado'
                : 'Sin publicar'}
          </span>
          <button
            type="button"
            className="boton-secundario boton-chico"
            aria-expanded={abierta}
            onClick={() => setAbierta(!abierta)}
          >
            {abierta ? 'Cerrar' : 'Ver y completar'}
          </button>
        </div>
        <p className="profe-nota">
          {datosDeHoy.entrenamientos} entrenamientos en {anio}
          {datosDeHoy.completo ? '.' : ' hasta hoy (el año todavía no terminó: lo ideal es publicarla a fin de año).'}
        </p>

        {faltaInstalar && (
          <p className="auth-message" role="alert">
            Falta activar la evaluación del año en la base de datos (SQL 038 de Supabase).
          </p>
        )}

        {abierta && (
          <>
            <EvaluacionAnual
              resumen={vistaPrevia}
              nombreAlumno={nombreAlumno}
              nombreProfe={nombreProfe}
            />

            {publicada ? (
              <p className="profe-nota">
                Está publicada: los números quedaron fijos como los vio el alumno. Para cambiar algo,
                tocá “Dejar de publicar”, corregí y volvé a publicarla.
              </p>
            ) : (
              <div className="evaluacion-anual-textos">
                <label className="editor-campo editor-campo-ancho">
                  <span>Tu comentario del año</span>
                  <textarea
                    className="form-textarea"
                    placeholder="Cómo lo viste en el año: constancia, técnica, lo que más mejoró…"
                    maxLength={MAXIMO_LETRAS}
                    value={comentario}
                    onChange={(event) => setComentario(event.target.value)}
                  />
                </label>
                <label className="editor-campo editor-campo-ancho">
                  <span>Objetivos para el año que viene</span>
                  <textarea
                    className="form-textarea"
                    placeholder="Ej: llegar a 100 kg en sentadilla, entrenar 3 veces por semana…"
                    maxLength={MAXIMO_LETRAS}
                    value={objetivos}
                    onChange={(event) => setObjetivos(event.target.value)}
                  />
                </label>
              </div>
            )}

            <div className="acciones-fila">
              {publicada ? (
                <button
                  type="button"
                  className="boton-secundario"
                  onClick={despublicar}
                  disabled={Boolean(ocupado)}
                >
                  {ocupado === 'despublicando' ? 'Cambiando…' : 'Dejar de publicar'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="boton-principal"
                    onClick={() => guardar(true)}
                    disabled={Boolean(ocupado) || faltaInstalar}
                  >
                    {ocupado === 'publicando' ? 'Publicando…' : 'Publicar para el alumno'}
                  </button>
                  <button
                    type="button"
                    className="boton-secundario"
                    onClick={() => guardar(false)}
                    disabled={Boolean(ocupado) || faltaInstalar}
                  >
                    {ocupado === 'guardando' ? 'Guardando…' : 'Guardar borrador'}
                  </button>
                </>
              )}
              <BotonPdf
                resumen={vistaPrevia}
                nombreAlumno={nombreAlumno}
                nombreProfe={nombreProfe}
                className="boton-secundario"
                Plantilla={EvaluacionAnual}
                nombreArchivo={nombreArchivoEvaluacionAnual(anio, nombreAlumno)}
                tituloPie={`Evaluación ${anio}`}
              />
            </div>
          </>
        )}
      </div>
    </section>
  )
}
