// Íconos de línea de DREY, todos del mismo estilo que los del menú. Se
// usan en lugar de los emojis: se ven igual en todos los celulares y toman
// el color del texto (y el color que elige cada usuario).
//
//   <Icono nombre="reloj" />           → del tamaño de la letra, para ir
//                                        dentro de un texto.
//   <Icono nombre="trofeo" tamano={22} /> → en píxeles.
const TRAZOS = {
  pago: <path d="M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20" />,
  reloj: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2" />,
  gimnasio: <path d="M3 21V9l9-6 9 6v12M9 21v-6h6v6" />,
  grafico: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
  subida: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  profe: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />,
  medida: <path d="M3 17l14-14 4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2" />,
  campana: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />,
  chat: <path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6A8 8 0 1 1 21 12z" />,
  fuego: (
    <path d="M12 22c4 0 7-2.8 7-7 0-3.5-2.2-5.9-4-8 0 2.5-1.5 4-3 4 0-3-1-6-4-9 0 4-5 7-5 13 0 4.2 4 7 9 7z" />
  ),
  trofeo: (
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
  ),
  nota: <path d="M4 4h16v12l-4 4H4zM16 20v-4h4M8 9h8M8 13h5" />,
  idea: (
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" />
  ),
  pesa: <path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" />,
  calendario: <path d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" />,
  ojo: (
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
  ),
  nube: <path d="M7 18a5 5 0 0 1-.6-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z" />,
  documento: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />,
  tablero: <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" />,
  sonido: <path d="M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" />,
  silencio: <path d="M4 10v4h4l5 4V6L8 10zM17 9l5 6M22 9l-5 6" />,
  lapiz: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
  estrella: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
  teclado: <path d="M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10" />,
  arrastrar: <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" />,
  descargar: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  calma: <path d="M5 21c0-9 6-15 15-16-1 9-7 15-15 16zM5 21l7-7" />,
  drey: <path d="M4 4h16v16H4zM9 8v8M9 8h3a4 4 0 0 1 0 8H9" />,
  portada: <path d="M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6" />,
  historial: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />,
}

export default function Icono({ nombre, tamano, className = '' }) {
  const medida = tamano || '1em'
  return (
    <svg
      className={`icono ${tamano ? '' : 'icono-en-texto'} ${className}`.trim()}
      width={medida}
      height={medida}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRAZOS[nombre] || TRAZOS.campana}
    </svg>
  )
}
