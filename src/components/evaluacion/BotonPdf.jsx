import { useState } from 'react'
import { crearPdfEvaluacion, descargarPdf } from '../../services/pdfEvaluacion.js'
import { mostrarAviso } from '../../services/avisos.js'
import { nombreArchivoEvaluacion } from '../../utils/evaluacion.js'

// Botón "Descargar PDF" de una evaluación (profe y alumno).
export default function BotonPdf({
  resumen,
  nombreAlumno,
  nombreProfe,
  className = 'boton-secundario boton-chico',
}) {
  const [armando, setArmando] = useState(false)

  async function descargar() {
    setArmando(true)
    try {
      const blob = await crearPdfEvaluacion({ resumen, nombreAlumno, nombreProfe })
      descargarPdf(blob, nombreArchivoEvaluacion(resumen, nombreAlumno))
    } catch {
      mostrarAviso('No pudimos armar el PDF. Probá de nuevo.', 'error')
    } finally {
      setArmando(false)
    }
  }

  return (
    <button type="button" className={className} onClick={descargar} disabled={armando}>
      {armando ? 'Armando el PDF…' : '⬇ Descargar PDF'}
    </button>
  )
}
