import { useEffect, useState } from 'react'
import EvaluacionAnual from './EvaluacionAnual.jsx'
import BotonPdf from './BotonPdf.jsx'
import {
  cargarEvaluacionesAnuales,
  marcarEvaluacionAnualVista,
} from '../../services/evaluacionAnual.js'
import { nombreArchivoEvaluacionAnual } from '../../utils/evaluacionAnual.js'

// "Evaluación del año" en el Progreso del alumno: las que su profe le
// publicó (una por año). Se abre de a una; al abrirla queda marcada como
// vista y el profe lo ve. Puede bajarla en PDF.
// Si no hay ninguna publicada (o no hay señal), no se muestra nada.
export default function EvaluacionesAnualesAlumno({ clienteId }) {
  const [evaluaciones, setEvaluaciones] = useState([])
  const [abierta, setAbierta] = useState(null)

  useEffect(() => {
    let vigente = true
    cargarEvaluacionesAnuales(clienteId).then((resultado) => {
      if (vigente) setEvaluaciones(resultado.evaluaciones)
    })
    return () => {
      vigente = false
    }
  }, [clienteId])

  function abrir(evaluacion) {
    const cerrar = abierta === evaluacion.id
    setAbierta(cerrar ? null : evaluacion.id)
    if (cerrar || evaluacion.visto) return
    marcarEvaluacionAnualVista(evaluacion.id)
    setEvaluaciones((lista) =>
      lista.map((otra) => (otra.id === evaluacion.id ? { ...otra, visto: true } : otra)),
    )
  }

  if (evaluaciones.length === 0) return null

  return (
    <section className="bloque-pagina evaluaciones-lista">
      <p className="seccion-etiqueta">Evaluación del año</p>
      {evaluaciones.map((evaluacion) => (
        <div key={evaluacion.id} className="resumen-caja">
          <button
            type="button"
            className="evaluacion-desplegar"
            aria-expanded={abierta === evaluacion.id}
            onClick={() => abrir(evaluacion)}
          >
            <span>
              <strong>Tu año {evaluacion.anio}</strong>
              {evaluacion.visto ? '' : ' · nueva'}
            </span>
            <span className="avance-flecha" aria-hidden="true">
              {abierta === evaluacion.id ? '▲' : '▼'}
            </span>
          </button>
          {abierta === evaluacion.id && (
            <>
              <EvaluacionAnual
                resumen={evaluacion}
                nombreAlumno={evaluacion.datos?.nombreAlumno}
                nombreProfe={evaluacion.datos?.nombreProfe}
              />
              <BotonPdf
                resumen={evaluacion}
                nombreAlumno={evaluacion.datos?.nombreAlumno}
                nombreProfe={evaluacion.datos?.nombreProfe}
                Plantilla={EvaluacionAnual}
                nombreArchivo={nombreArchivoEvaluacionAnual(
                  evaluacion.anio,
                  evaluacion.datos?.nombreAlumno,
                )}
                tituloPie={`Evaluación ${evaluacion.anio}`}
              />
            </>
          )}
        </div>
      ))}
    </section>
  )
}
