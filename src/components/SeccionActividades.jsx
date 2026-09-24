// Muestra el calentamiento previo o la vuelta a la calma de una rutina,
// tal como lo ve el cliente:
//
//   🔥 Calentamiento previo
//   Cinta — 10 min
//   Movilidad
//     · Movilidad de hombros
//
// La usan la rutina del cliente y el editor del profe, así los dos ven
// exactamente lo mismo.
export default function SeccionActividades({ actividades = [] }) {
  return (
    <ul className="actividades-lista">
      {actividades.map((actividad, indice) => (
        <li key={`${actividad.nombre}-${indice}`} className="actividad">
          <p className="actividad-nombre">
            {actividad.nombre}
            {actividad.duracion && (
              <span className="actividad-duracion"> — {actividad.duracion}</span>
            )}
          </p>
          {actividad.items?.length > 0 && (
            <ul className="actividad-items">
              {actividad.items.map((item, posicion) => (
                <li key={`${item}-${posicion}`}>{item}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}
