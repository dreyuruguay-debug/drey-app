// Resumen de la semana en 7 puntos (L M M J V S D), usado en Inicio.
// "dias" es un array de 7 objetos { dia, cumplido }:
//   cumplido === true  -> entrenamiento hecho (punto verde con ✓)
//   cumplido === false -> entrenamiento asignado todavía pendiente
//   cumplido === null  -> día de descanso (punto punteado)
// "diaHoy" resalta con un aro el punto del día actual.
const LETRAS = {
  Lunes: 'L',
  Martes: 'M',
  Miércoles: 'M',
  Jueves: 'J',
  Viernes: 'V',
  Sábado: 'S',
  Domingo: 'D',
}

export default function WeekDots({ dias, diaHoy }) {
  return (
    <div className="week-dots">
      {dias.map((item) => {
        const clases = ['week-dot']
        if (item.cumplido === true) clases.push('week-dot-cumplido')
        if (item.cumplido === null) clases.push('week-dot-descanso')
        if (item.dia === diaHoy) clases.push('week-dot-hoy')

        return (
          <div key={item.dia} className="week-dot-col">
            <span className={clases.join(' ')}>{item.cumplido === true ? '✓' : ''}</span>
            <span className="week-dot-letra">{LETRAS[item.dia]}</span>
          </div>
        )
      })}
    </div>
  )
}
