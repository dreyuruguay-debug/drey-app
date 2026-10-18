import { useMemo, useState } from 'react'
import EvaluacionMensual from './EvaluacionMensual.jsx'
import BotonPdf from './BotonPdf.jsx'
import {
  anotarGuardadoEnDrive,
  despublicarResumen,
  guardarEvaluacion,
  publicarResumen,
} from '../../services/progreso.js'
import { crearPdfEvaluacion } from '../../services/pdfEvaluacion.js'
import { driveConfigurado, guardarPdfEnDrive } from '../../services/drive.js'
import { mostrarAviso } from '../../services/avisos.js'
import { textoFechaCorta } from '../../utils/dias.js'
import {
  esEvaluacionCompleta,
  nombreArchivoEvaluacion,
  notasLimpias,
} from '../../utils/evaluacion.js'

// Una evaluación mensual en el panel del profe (ficha del alumno →
// Progresión). Muestra la vista previa tal cual la va a ver el alumno y,
// mientras es borrador, lo que el profe completa:
//   · si se muestran las medidas corporales (opcional, viene apagado),
//   · algo particular del mes, una nota por ejercicio, el comentario
//     general y los objetivos para el mes que viene.
// "Guardar borrador" guarda sin mostrársela al alumno; "Aprobar y
// publicar" se la manda (le llega la notificación) y, si Google Drive
// está conectado, guarda el PDF en la carpeta del alumno.
//
// datosVivos: la evaluación recalculada en el momento (con todo el
// historial y las medidas de hoy), o null si ya está publicada (se usa
// la foto guardada al publicar).
export default function EditorEvaluacion({
  resumen,
  datosVivos,
  alumnoId,
  nombreAlumno,
  nombreProfe,
  ajustesDrive,
  onCambio,
}) {
  const notasGuardadas = notasLimpias(resumen.notas)
  const [comentario, setComentario] = useState(resumen.comentario_profe || '')
  const [destacado, setDestacado] = useState(notasGuardadas.destacado)
  const [objetivos, setObjetivos] = useState(notasGuardadas.objetivos)
  const [notasEjercicio, setNotasEjercicio] = useState(notasGuardadas.ejercicios)
  const [incluirMedidas, setIncluirMedidas] = useState(Boolean(resumen.incluir_medidas))
  const [alPublicarADrive, setAlPublicarADrive] = useState(true)
  const [ocupado, setOcupado] = useState('')
  const [drive, setDrive] = useState({
    archivoUrl: resumen.drive_url,
    carpetaUrl: resumen.drive_carpeta_url,
    fecha: resumen.drive_guardado_en,
  })

  const esBorrador = resumen.estado !== 'publicado'
  const conDrive = driveConfigurado(ajustesDrive)

  const datos = useMemo(() => {
    const base = esBorrador && datosVivos ? datosVivos : resumen.datos
    return { ...base, nombreAlumno, nombreProfe }
  }, [esBorrador, datosVivos, resumen.datos, nombreAlumno, nombreProfe])

  const notas = { destacado, objetivos, ejercicios: notasEjercicio }
  // Lo que se ve y lo que va al PDF: igual a lo que se guarda.
  const vista = {
    ...resumen,
    datos,
    comentario_profe: comentario,
    notas,
    incluir_medidas: incluirMedidas,
  }
  const hayMedidas = Boolean(datos.medidas?.campos?.length)
  const completa = esEvaluacionCompleta(datos)
  const evaluacion = { comentario, notas, incluirMedidas, datos }

  async function guardar() {
    setOcupado('guardar')
    const error = await guardarEvaluacion(resumen.id, evaluacion)
    setOcupado('')
    if (error) return avisarError(error)
    mostrarAviso('Borrador guardado')
    onCambio?.()
  }

  async function publicar() {
    setOcupado('publicar')
    const error = await publicarResumen(resumen.id, evaluacion)
    if (error) {
      setOcupado('')
      return avisarError(error)
    }
    mostrarAviso('Evaluación publicada: ya le llegó al alumno')
    if (conDrive && alPublicarADrive) await mandarADrive({ ...vista, estado: 'publicado' })
    setOcupado('')
    onCambio?.()
  }

  async function volverABorrador() {
    setOcupado('despublicar')
    const error = await despublicarResumen(resumen.id)
    setOcupado('')
    if (error) return avisarError(error)
    onCambio?.()
  }

  async function mandarADrive(resumenParaPdf = vista) {
    setOcupado('drive')
    try {
      const blob = await crearPdfEvaluacion({ resumen: resumenParaPdf, nombreAlumno, nombreProfe })
      const respuesta = await guardarPdfEnDrive({
        ajustes: ajustesDrive,
        blob,
        nombreArchivo: nombreArchivoEvaluacion(resumenParaPdf, nombreAlumno),
        alumnoId,
        nombreAlumno,
      })
      if (!respuesta.ok) {
        mostrarAviso(respuesta.error, 'error')
        return
      }
      const anotado = await anotarGuardadoEnDrive(resumen.id, respuesta)
      setDrive({
        archivoUrl: respuesta.archivoUrl,
        carpetaUrl: respuesta.carpetaUrl,
        fecha: anotado?.drive_guardado_en || new Date().toISOString(),
      })
      mostrarAviso('PDF guardado en la carpeta del alumno en Drive')
    } catch {
      mostrarAviso('No pudimos armar el PDF. Probá de nuevo.', 'error')
    } finally {
      setOcupado('')
    }
  }

  return (
    <div className="evaluacion-editor">
      <EvaluacionMensual resumen={vista} nombreAlumno={nombreAlumno} nombreProfe={nombreProfe} />

      {esBorrador && completa && (
        <section className="evaluacion-formulario">
          <p className="profe-seccion-label">Completá la evaluación</p>

          <button
            type="button"
            className="tarjeta-rutina"
            role="switch"
            aria-checked={incluirMedidas}
            disabled={!hayMedidas}
            onClick={() => setIncluirMedidas((actual) => !actual)}
          >
            <span className="tarjeta-rutina-textos">
              <strong>Incluir medidas corporales</strong>
              <small>
                {hayMedidas
                  ? 'Peso, cintura, cadera… del inicio del mes contra ahora'
                  : 'No hay medidas cargadas de este mes (ficha → Medidas y fotos)'}
              </small>
            </span>
            <span
              className={incluirMedidas ? 'interruptor interruptor-on' : 'interruptor'}
              aria-hidden="true"
            />
          </button>

          <CampoTexto
            etiqueta="Algo particular de este mes"
            ayuda="Aparece arriba, junto a lo más destacado."
            valor={destacado}
            onCambio={setDestacado}
            ejemplo="Ej.: mejoró mucho la técnica de la sentadilla"
          />

          <div className="evaluacion-notas-ejercicios">
            <p className="ajustes-campo-titulo">Nota por ejercicio (opcional)</p>
            {(datos.ejercicios || []).map((ejercicio) => (
              <label key={ejercicio.ejercicio_id} className="evaluacion-nota-ejercicio">
                <span>{ejercicio.nombre}</span>
                <input
                  className="auth-input"
                  type="text"
                  maxLength={300}
                  value={notasEjercicio[ejercicio.ejercicio_id] || ''}
                  placeholder="Ej.: cuidar la bajada, subir 2,5 kg"
                  onChange={(event) =>
                    setNotasEjercicio((actual) => ({
                      ...actual,
                      [ejercicio.ejercicio_id]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>

          <CampoTexto
            etiqueta="Comentario para el alumno"
            valor={comentario}
            onCambio={setComentario}
            ejemplo="Cómo lo viste este mes, qué lo felicitás…"
            filas={4}
          />
          <CampoTexto
            etiqueta="Objetivos para el mes que viene"
            valor={objetivos}
            onCambio={setObjetivos}
            ejemplo="Ej.: llegar a 80 kg en sentadilla, entrenar 3 veces por semana"
          />

          {conDrive && (
            <label className="evaluacion-casilla">
              <input
                type="checkbox"
                checked={alPublicarADrive}
                onChange={(event) => setAlPublicarADrive(event.target.checked)}
              />
              Al publicar, guardar el PDF en su carpeta de Google Drive
            </label>
          )}

          <div className="evaluacion-botones">
            <button
              type="button"
              className="boton-secundario"
              onClick={guardar}
              disabled={Boolean(ocupado)}
            >
              {ocupado === 'guardar' ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button
              type="button"
              className="boton-principal"
              onClick={publicar}
              disabled={Boolean(ocupado)}
            >
              {ocupado === 'publicar' || (ocupado === 'drive' && esBorrador)
                ? 'Publicando…'
                : 'Aprobar y publicar al alumno'}
            </button>
          </div>
        </section>
      )}

      <div className="evaluacion-acciones">
        <BotonPdf resumen={vista} nombreAlumno={nombreAlumno} nombreProfe={nombreProfe} />
        {conDrive ? (
          <button
            type="button"
            className="boton-secundario boton-chico"
            onClick={() => mandarADrive()}
            disabled={Boolean(ocupado)}
          >
            {ocupado === 'drive'
              ? 'Guardando en Drive…'
              : drive.archivoUrl
                ? '↻ Volver a guardar en Drive'
                : '☁ Guardar en Drive'}
          </button>
        ) : (
          <small className="evaluacion-sin-drive">
            Para guardarla en Google Drive, el Admin conecta la carpeta en Ajustes → Drive.
          </small>
        )}
        {!esBorrador && (
          <button
            type="button"
            className="profe-cerrar-selector"
            onClick={volverABorrador}
            disabled={Boolean(ocupado)}
          >
            Editar (vuelve a borrador y se le oculta al alumno)
          </button>
        )}
      </div>

      {drive.archivoUrl && (
        <p className="evaluacion-drive-estado">
          ✓ Guardada en Drive el {textoFechaCorta(drive.fecha)} ·{' '}
          <a href={drive.archivoUrl} target="_blank" rel="noreferrer">
            Abrir PDF
          </a>
          {drive.carpetaUrl && (
            <>
              {' · '}
              <a href={drive.carpetaUrl} target="_blank" rel="noreferrer">
                Carpeta del alumno
              </a>
            </>
          )}
        </p>
      )}
    </div>
  )
}

function CampoTexto({ etiqueta, ayuda, valor, onCambio, ejemplo, filas = 2 }) {
  return (
    <label className="ajustes-campo">
      <span>{etiqueta}</span>
      {ayuda && <small className="evaluacion-ayuda">{ayuda}</small>}
      <textarea
        className="form-textarea"
        rows={filas}
        maxLength={2000}
        value={valor}
        placeholder={ejemplo}
        onChange={(event) => onCambio(event.target.value)}
      />
    </label>
  )
}

function avisarError(error) {
  const faltaBase = /notas|incluir_medidas|actualizado_en|does not exist|schema cache/i.test(
    error?.message || '',
  )
  mostrarAviso(
    faltaBase
      ? 'Falta instalar la actualización de la base (SQL 031)'
      : 'No pudimos guardar. Probá de nuevo.',
    'error',
  )
}
