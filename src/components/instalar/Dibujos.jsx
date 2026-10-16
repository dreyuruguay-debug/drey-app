// Dibujos de la guía para instalar DREY (GuiaInstalacion.jsx): los
// botones tal como se ven en el celular, para que la persona los
// reconozca, y un celular chico que marca DÓNDE está cada botón.
//
// Son dibujos propios y simples (no capturas de pantalla), así se ven
// bien en modo claro y oscuro y no quedan viejos si Apple o Google
// cambian un detalle.

const TRAZO = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function Icono({ children, etiqueta }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" role="img" aria-label={etiqueta}>
      {children}
    </svg>
  )
}

// El botón Compartir de iPhone: cuadradito con la flecha hacia arriba.
export function IconoCompartir() {
  return (
    <Icono etiqueta="Botón Compartir">
      <path {...TRAZO} d="M12 3v12M8 7l4-4 4 4" />
      <path
        {...TRAZO}
        d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16"
      />
    </Icono>
  )
}

// "Agregar a inicio": cuadradito con un +.
export function IconoAgregar() {
  return (
    <Icono etiqueta="Agregar a inicio">
      <rect {...TRAZO} x="4" y="4" width="16" height="16" rx="3.5" />
      <path {...TRAZO} d="M12 8.5v7M8.5 12h7" />
    </Icono>
  )
}

// Los tres puntitos de Safari 26 (···).
export function IconoPuntos() {
  return (
    <Icono etiqueta="Botón con tres puntitos">
      <circle cx="5.5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.8" fill="currentColor" />
    </Icono>
  )
}

// Los tres puntitos de Chrome y de casi todas las apps de Android (⋮).
export function IconoPuntosVerticales() {
  return (
    <Icono etiqueta="Botón con tres puntitos">
      <circle cx="12" cy="5.5" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="18.5" r="1.8" fill="currentColor" />
    </Icono>
  )
}

// El menú del navegador de Samsung (tres rayitas).
export function IconoRayitas() {
  return (
    <Icono etiqueta="Botón de menú">
      <path {...TRAZO} d="M5 7h14M5 12h14M5 17h14" />
    </Icono>
  )
}

// "Instalar": flecha hacia abajo sobre una bandeja.
export function IconoInstalar() {
  return (
    <Icono etiqueta="Instalar">
      <path {...TRAZO} d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path {...TRAZO} d="M5 17v1.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V17" />
    </Icono>
  )
}

// La brújula de Safari.
export function IconoSafari() {
  return (
    <Icono etiqueta="Safari">
      <circle {...TRAZO} cx="12" cy="12" r="8.5" />
      <path d="M15.5 8.5 13.2 13.2 8.5 15.5l2.3-4.7z" fill="currentColor" />
    </Icono>
  )
}

// Abrir afuera: cuadradito con una flecha que sale.
export function IconoAbrirAfuera() {
  return (
    <Icono etiqueta="Abrir en el navegador">
      <path {...TRAZO} d="M14 4h6v6M20 4l-8.5 8.5" />
      <path
        {...TRAZO}
        d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"
      />
    </Icono>
  )
}

// El interruptor "Abrir como app web" prendido (mismo dibujo que el de
// las notificaciones de DREY).
export function DibujoInterruptor() {
  return (
    <span className="interruptor interruptor-on" role="img" aria-label="Interruptor prendido" />
  )
}

// El ícono de DREY, como va a quedar en la pantalla de inicio.
export function IconoDrey() {
  return <img src="/icon-192.png" alt="Ícono de DREY" className="instalar-icono-drey" />
}

// Un celular chico con un punto verde donde está el botón a tocar.
//   lugar: 'abajo-centro' (Compartir en iPhone), 'abajo-derecha'
//          (··· de Safari 26 y menú de Samsung) o 'arriba-derecha'
//          (⋮ de Chrome y de Instagram/Facebook).
const PUNTOS = {
  'abajo-centro': { cx: 22, cy: 70 },
  'abajo-derecha': { cx: 34, cy: 70 },
  'arriba-derecha': { cx: 34, cy: 13 },
}

export function TelefonoConMarca({ lugar }) {
  const punto = PUNTOS[lugar] || PUNTOS['abajo-centro']
  const barraArriba = lugar === 'arriba-derecha'
  return (
    <svg
      className="instalar-telefono"
      width="44"
      height="84"
      viewBox="0 0 44 84"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="2"
        width="40"
        height="80"
        rx="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {/* La barra del navegador (arriba en Chrome, abajo en Safari) */}
      <rect
        x="7"
        y={barraArriba ? 8 : 64}
        width="30"
        height="11"
        rx="5.5"
        fill="currentColor"
        opacity="0.18"
      />
      {/* Contenido de la página */}
      <rect
        x="9"
        y={barraArriba ? 25 : 12}
        width="26"
        height="4"
        rx="2"
        fill="currentColor"
        opacity="0.3"
      />
      <rect
        x="9"
        y={barraArriba ? 33 : 20}
        width="18"
        height="4"
        rx="2"
        fill="currentColor"
        opacity="0.3"
      />
      <rect
        x="9"
        y={barraArriba ? 41 : 28}
        width="26"
        height="14"
        rx="3"
        fill="currentColor"
        opacity="0.15"
      />
      <circle className="instalar-telefono-pulso" cx={punto.cx} cy={punto.cy} r="7" />
      <circle className="instalar-telefono-punto" cx={punto.cx} cy={punto.cy} r="3.6" />
    </svg>
  )
}
