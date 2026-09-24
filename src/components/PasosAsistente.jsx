// Indicador de pasos de un asistente ("1 Nombre · 2 Grupos · 3 Rutina").
// Lo usan el registro del cliente y los asistentes del profe para crear
// rutinas y bloques de ejercicios, así todos se ven iguales.
//
// pasos: lista de títulos. actual: índice del paso en el que se está.
export default function PasosAsistente({ pasos, actual, etiqueta = 'Pasos' }) {
  return (
    <ol className="registro-pasos" aria-label={etiqueta}>
      {pasos.map((titulo, indice) => (
        <li
          key={titulo}
          className={
            indice === actual
              ? 'registro-paso registro-paso-actual'
              : indice < actual
                ? 'registro-paso registro-paso-hecho'
                : 'registro-paso'
          }
          aria-current={indice === actual ? 'step' : undefined}
        >
          <span className="registro-paso-numero">{indice + 1}</span>
          <span className="registro-paso-titulo">{titulo}</span>
        </li>
      ))}
    </ol>
  )
}
