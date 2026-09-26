import { textoCalentamiento } from '../utils/formatos.js'
import { textoProgresion } from '../utils/ciclos.js'

// Lo que se le pide al cliente en un ejercicio: series × repeticiones,
// peso objetivo, RPE y sus series de calentamiento. Lo usan la rutina del
// cliente y el editor del profe, así los dos muestran exactamente lo mismo.
export default function ObjetivoEjercicio({ ejercicio }) {
  const calentamiento = textoCalentamiento(ejercicio.calentamiento)
  return (
    <>
      <p className="ejercicio-objetivo">
        Objetivo: {ejercicio.series} × {ejercicio.reps_objetivo || '—'}
        {ejercicio.kg_objetivo ? ` · Peso objetivo ${ejercicio.kg_objetivo} kg` : ''}
        {ejercicio.rpe ? ` · RPE ${ejercicio.rpe}` : ''}
      </p>
      {textoProgresion(ejercicio.progresion) && (
        <p className="ejercicio-progresion">📈 Progresión: {textoProgresion(ejercicio.progresion)}</p>
      )}
      {calentamiento && (
        <p className="ejercicio-calentamiento">🔥 Calentamiento: {calentamiento}</p>
      )}
    </>
  )
}
