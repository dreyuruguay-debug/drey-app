import { nombreCortoDeMetodo } from '../../data/metodos.js'
import { textoRango } from '../../utils/formatos.js'
import { semanasDelEjercicio } from '../../utils/programa.js'
import { mismaPrescripcion, textoPrescripcion } from '../../utils/semanas.js'
import {
  borradorACalentamiento,
  textoSeriesCalentamiento,
} from '../../utils/seriesCalentamiento.js'

// Un día de la planilla, tal como va a quedar en la app: qué rutina crea
// o actualiza (y qué cambia), sus bloques y ejercicios con lo de cada
// semana, calentamiento y notas.
//   dia: día del programa (utils/programa.js)
//   plan: lo que se va a hacer en la base (planDeGuardado) o null si la
//         planilla todavía tiene errores.
//   destino / opcionesDestino / onDestino: para un día sin rutina, si se
//         crea una nueva o reemplaza a otra del cliente.
export default function VistaPreviaDia({
  dia,
  semanas,
  plan,
  destino,
  opcionesDestino,
  onDestino,
}) {
  const cantidad = dia.bloques.reduce((total, bloque) => total + bloque.ejercicios.length, 0)
  return (
    <details className="planilla-dia">
      <summary>
        <span className="planilla-dia-titulo">
          <strong>
            Día {dia.numero} · {dia.nombre}
          </strong>
          <small>
            {cantidad === 1 ? '1 ejercicio' : `${cantidad} ejercicios`}
            {plan ? ` · ${textoCambios(plan)}` : ''}
          </small>
        </span>
        <span className={claseEstado(plan, dia)}>{textoEstado(plan, dia)}</span>
      </summary>

      <div className="planilla-dia-contenido">
        {destino !== undefined && (
          <label className="editor-campo">
            <span>¿Dónde va?</span>
            <select
              className="profe-calendario-select"
              value={destino}
              onChange={(event) => onDestino(event.target.value)}
            >
              <option value="nueva">Crear una rutina nueva</option>
              {opcionesDestino.map(({ rutina }) => (
                <option key={rutina.id} value={rutina.id}>
                  Reemplazar “{rutina.nombre}”
                </option>
              ))}
            </select>
          </label>
        )}
        {plan && <p className="profe-nota planilla-nota">{textoCiclo(plan)}</p>}

        {dia.bloques.map((bloque, indice) => (
          <div key={indice} className="planilla-bloque">
            <p className="planilla-bloque-titulo">
              {bloque.codigo} · {nombreCortoDeMetodo(bloque.metodo)}
              {textoRango(bloque.descansoMin, bloque.descansoMax)
                ? ` · descanso ${textoRango(bloque.descansoMin, bloque.descansoMax)}`
                : ''}
            </p>
            {bloque.ejercicios.map((item, posicion) => (
              <EjercicioPrevio key={posicion} item={item} semanas={semanas} />
            ))}
          </div>
        ))}
      </div>
    </details>
  )
}

function EjercicioPrevio({ item, semanas }) {
  const plan = semanasDelEjercicio(item, semanas)
  const igual = plan.every((semana) => mismaPrescripcion(semana, plan[0]))
  const calentamiento = textoSeriesCalentamiento(borradorACalentamiento(item))
  const extras = [item.rpe && `RPE ${item.rpe}`, item.tempo && `Tempo ${item.tempo}`].filter(
    Boolean,
  )
  return (
    <div className="planilla-ejercicio">
      <p className="planilla-ejercicio-nombre">
        {item.ejercicio?.nombre || item.planilla?.nombre}
        {item.ejercicio?.nuevo && (
          <span className="estado-chip estado-alerta estado-chip-chico">Nuevo</span>
        )}
      </p>
      {igual ? (
        <p className="ejercicio-objetivo">
          {textoPrescripcion(plan[0])}
          {semanas > 1 ? ' · todas las semanas' : ''}
          {extras.length ? ` · ${extras.join(' · ')}` : ''}
        </p>
      ) : (
        <>
          {extras.length > 0 && <p className="ejercicio-objetivo">{extras.join(' · ')}</p>}
          <ol className="ejercicio-semanas-lista">
            {plan.map((semana, indice) => (
              <li key={indice}>
                <strong>S{indice + 1}</strong> {textoPrescripcion(semana)}
              </li>
            ))}
          </ol>
        </>
      )}
      {calentamiento && <p className="ejercicio-calentamiento">Calentamiento: {calentamiento}</p>}
      {item.notas && <p className="ejercicio-notas">📝 {item.notas}</p>}
    </div>
  )
}

function textoEstado(plan, dia) {
  if (!plan) return dia.rutinaId ? 'Se actualiza' : 'Nueva'
  if (plan.accion === 'crear') return 'Rutina nueva'
  const { insertar, actualizar, borrar } = plan.cambios
  if (!insertar && !actualizar && !borrar && !plan.datosCambian) return 'Sin cambios'
  return 'Se actualiza'
}

function claseEstado(plan, dia) {
  const texto = textoEstado(plan, dia)
  if (texto === 'Sin cambios') return 'estado-chip estado-neutro'
  if (texto === 'Rutina nueva' || texto === 'Nueva') return 'estado-chip estado-ok'
  return 'estado-chip estado-alerta'
}

// "2 cambian · 1 nuevo · 1 se quita"
function textoCambios(plan) {
  if (plan.accion === 'crear') return 'se crea'
  const { insertar, actualizar, borrar } = plan.cambios
  const partes = []
  if (actualizar) partes.push(`${actualizar} ${actualizar === 1 ? 'cambia' : 'cambian'}`)
  if (insertar) partes.push(`${insertar} ${insertar === 1 ? 'nuevo' : 'nuevos'}`)
  if (borrar) partes.push(`${borrar} se ${borrar === 1 ? 'quita' : 'quitan'}`)
  return partes.join(' · ') || 'ejercicios sin cambios'
}

function textoCiclo(plan) {
  const { antes, despues, reinicia } = plan.ciclo
  const publica = plan.eraBorrador
    ? ' Estaba en borrador: se publica (el cliente la va a ver).'
    : ''
  if (!despues) {
    return `${antes ? `Se quita el ciclo de ${antes} semanas: ` : ''}todas las semanas son iguales.${publica}`
  }
  const arranque =
    plan.accion === 'crear' || reinicia || !antes ? ' Empieza esta semana (semana 1).' : ''
  return `Ciclo de ${despues} semanas${antes && antes !== despues ? ` (antes ${antes})` : ''}.${arranque}${publica}`
}
