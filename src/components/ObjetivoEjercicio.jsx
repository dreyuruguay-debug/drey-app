import { textoSeriesCalentamiento } from '../utils/seriesCalentamiento.js'
import { textoProgresion } from '../utils/ciclos.js'
import { normalizarSemanas, resumenPorSemana } from '../utils/semanas.js'

// Lo que se le pide al cliente en un ejercicio: series × repeticiones,
// peso objetivo, RPE, tempo, sus series de calentamiento y las notas del
// profe. Si cada semana del ciclo es distinta, una línea por semana.
// Se usa en el editor del profe (components/BloqueProfe.jsx).
// semanasCiclo: semanas del ciclo de la rutina (0 = sin ciclo).
export default function ObjetivoEjercicio({ ejercicio, semanasCiclo = 0 }) {
  const calentamiento = textoSeriesCalentamiento(ejercicio.calentamiento)
  const porSemana = normalizarSemanas(ejercicio.semanas).length
    ? resumenPorSemana(ejercicio, semanasCiclo)
    : []
  const extras = [
    ejercicio.rpe && `RPE ${ejercicio.rpe}`,
    ejercicio.tempo && `Tempo ${ejercicio.tempo}`,
  ].filter(Boolean)

  return (
    <>
      {porSemana.length > 0 ? (
        <div className="ejercicio-semanas">
          <p className="ejercicio-objetivo">
            Cada semana distinta{extras.length ? ` · ${extras.join(' · ')}` : ''}
          </p>
          <ol className="ejercicio-semanas-lista">
            {porSemana.map(({ semana, texto }) => (
              <li key={semana}>
                <strong>S{semana}</strong> {texto}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="ejercicio-objetivo">
          Objetivo: {ejercicio.series} × {ejercicio.reps_objetivo || '—'}
          {ejercicio.kg_objetivo ? ` · Peso objetivo ${ejercicio.kg_objetivo} kg` : ''}
          {extras.length ? ` · ${extras.join(' · ')}` : ''}
        </p>
      )}
      {textoProgresion(ejercicio.progresion) && (
        <p className="ejercicio-progresion">
          📈 Progresión: {textoProgresion(ejercicio.progresion)}
        </p>
      )}
      {calentamiento && <p className="ejercicio-calentamiento">Calentamiento: {calentamiento}</p>}
      {ejercicio.notas && <p className="ejercicio-notas">📝 {ejercicio.notas}</p>}
    </>
  )
}
