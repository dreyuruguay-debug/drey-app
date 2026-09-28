const RADIO = 110
const CIRCUNFERENCIA = 2 * Math.PI * RADIO

// El reloj grande del modo entrenar: un anillo que se va vaciando y el
// tiempo en el medio. Lo usan el descanso y el calentamiento, así los dos
// se ven iguales.
//   proporcion: cuánto del anillo queda lleno (1 = lleno, 0 = vacío).
//   valor: el tiempo grande ("1:30"). detalle: el texto chico de abajo.
//   variante: 'calentamiento' pinta el anillo naranja (🔥).
export default function RelojCircular({ proporcion, valor, detalle, variante }) {
  const lleno = Math.min(1, Math.max(0, proporcion))
  return (
    <div className={variante ? `reloj-circular reloj-circular-${variante}` : 'reloj-circular'}>
      <svg viewBox="0 0 260 260" aria-hidden="true">
        <circle cx="130" cy="130" r={RADIO} className="reloj-circular-fondo" />
        <circle
          cx="130"
          cy="130"
          r={RADIO}
          className="reloj-circular-avance"
          strokeDasharray={CIRCUNFERENCIA}
          strokeDashoffset={CIRCUNFERENCIA * (1 - lleno)}
        />
      </svg>
      <div className="reloj-circular-texto" aria-live="off">
        <strong>{valor}</strong>
        {detalle && <span>{detalle}</span>}
      </div>
    </div>
  )
}
