// Racha de semanas en el Inicio del alumno (utils/dias.js, calcularRacha):
// cuántas semanas seguidas cumplió los días de su rutina y cuánto le falta
// para que esta semana sume. Grande y arriba: es lo que más motiva a
// volver.
export default function RachaSemanas({ racha }) {
  const { semanas, faltan, objetivo, completaEstaSemana } = racha
  const siguiente = semanas + (completaEstaSemana ? 0 : 1)
  let detalle
  if (completaEstaSemana) {
    detalle = '¡Semana cumplida! Seguí así la semana que viene.'
  } else if (semanas === 0) {
    detalle =
      objetivo === 1
        ? 'Entrená esta semana para empezar tu racha.'
        : `Entrená ${objetivo} días esta semana para empezar tu racha.`
  } else {
    detalle = `Te ${faltan === 1 ? 'falta 1 entrenamiento' : `faltan ${faltan} entrenamientos`} esta semana para llegar a ${siguiente}.`
  }

  return (
    <section className={semanas > 0 ? 'racha-tarjeta' : 'racha-tarjeta racha-tarjeta-vacia'}>
      <span className="racha-icono" aria-hidden="true">
        🔥
      </span>
      <div className="racha-textos">
        <p className="racha-titulo">
          <strong>{semanas}</strong> {semanas === 1 ? 'semana seguida' : 'semanas seguidas'}
        </p>
        <p className="racha-detalle">{detalle}</p>
      </div>
    </section>
  )
}
