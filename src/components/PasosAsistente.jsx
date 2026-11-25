// Indicador de pasos de un asistente ("1 Nombre · 2 Grupos · 3 Rutina").
// Lo usan el registro del cliente y los asistentes del profe para crear
// rutinas y bloques de ejercicios, así todos se ven iguales.
//
// Arriba de los pasos, "Paso 2 de 4 · Tu profe" y una barrita de avance,
// para que se sepa cuánto falta.
//
// pasos: lista de títulos. actual: índice del paso en el que se está.
export default function PasosAsistente({ pasos, actual, etiqueta = 'Pasos' }) {
  const avance = Math.round(((actual + 1) / pasos.length) * 100)
  return (
    <div className="pasos-asistente">
      <p className="pasos-asistente-texto" aria-live="polite">
        Paso {actual + 1} de {pasos.length} · <strong>{pasos[actual]}</strong>
      </p>
      <div
        className="pasos-asistente-barra"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={pasos.length}
        aria-valuenow={actual + 1}
        aria-label={etiqueta}
      >
        <span style={{ width: `${avance}%` }} />
      </div>
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
    </div>
  )
}
