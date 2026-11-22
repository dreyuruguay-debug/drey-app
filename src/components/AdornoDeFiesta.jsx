// El adorno de una fiesta (data/fiestas.js), dibujado acá mismo (sin
// imágenes: carga al instante y se ve igual en todos los celulares).
//   dibujo: 'arbol' (Navidad) o 'fuegos' (fin de año y Año Nuevo).
//   tamano: lado en píxeles.
// Es decorativo: los lectores de pantalla lo saltean.
export default function AdornoDeFiesta({ dibujo, tamano = 96, className = '' }) {
  const clase = `adorno-fiesta adorno-fiesta-${dibujo}${className ? ` ${className}` : ''}`
  return (
    <svg
      className={clase}
      width={tamano}
      height={tamano}
      viewBox="0 0 96 96"
      aria-hidden="true"
      focusable="false"
    >
      {dibujo === 'arbol' ? <Arbol /> : <Fuegos />}
    </svg>
  )
}

// Arbolito de Navidad: tres pisos, tronco, estrella y bolitas de colores.
function Arbol() {
  return (
    <>
      <rect x="43" y="76" width="10" height="12" rx="2" fill="#8a5a2b" />
      <path d="M48 14 L66 40 H30 Z" fill="#1e9e5a" />
      <path d="M48 30 L72 60 H24 Z" fill="#1a8a4e" />
      <path d="M48 48 L78 80 H18 Z" fill="#157642" />
      <path
        className="adorno-fiesta-brillo"
        d="M48 4 l3 7 7 .6 -5.4 4.6 1.7 7 -6.3 -3.8 -6.3 3.8 1.7 -7 -5.4 -4.6 7 -.6 Z"
        fill="#ffd23f"
      />
      <circle cx="42" cy="36" r="3" fill="#e5484d" />
      <circle cx="55" cy="50" r="3" fill="#ffd23f" />
      <circle cx="38" cy="56" r="3" fill="#4aa8ff" />
      <circle cx="60" cy="70" r="3" fill="#e5484d" />
      <circle cx="34" cy="72" r="3" fill="#ffd23f" />
      <circle cx="48" cy="66" r="3" fill="#ffffff" />
    </>
  )
}

// Fuegos artificiales: tres estallidos de rayitos.
function Fuegos() {
  return (
    <>
      <Estallido x={30} y={34} radio={22} color="#ffd23f" />
      <Estallido x={66} y={28} radio={16} color="#e5484d" />
      <Estallido x={58} y={66} radio={20} color="#4aa8ff" />
    </>
  )
}

const RAYOS = 10

function Estallido({ x, y, radio, color }) {
  return (
    <g className="adorno-fiesta-brillo" stroke={color} strokeWidth="3" strokeLinecap="round">
      {Array.from({ length: RAYOS }, (_, indice) => {
        const angulo = (indice / RAYOS) * Math.PI * 2
        const cos = Math.cos(angulo)
        const sin = Math.sin(angulo)
        return (
          <line
            key={indice}
            x1={x + cos * radio * 0.35}
            y1={y + sin * radio * 0.35}
            x2={x + cos * radio}
            y2={y + sin * radio}
          />
        )
      })}
      <circle cx={x} cy={y} r="2.5" fill={color} stroke="none" />
    </g>
  )
}
