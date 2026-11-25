// Íconos de línea de los avisos del Inicio (mismo estilo que el menú de
// abajo). Reemplazan a los emojis que usaban los carteles: se ven igual
// en todos los celulares y toman el color que elige el alumno.
const TRAZOS = {
  pago: <path d="M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20" />,
  reloj: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2" />,
  gimnasio: <path d="M3 21V9l9-6 9 6v12M9 21v-6h6v6" />,
  grafico: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
  profe: (
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  ),
  medida: <path d="M3 17l14-14 4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2" />,
  campana: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />,
}

export default function IconoAviso({ tipo, tamano = 20 }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRAZOS[tipo] || TRAZOS.campana}
    </svg>
  )
}
