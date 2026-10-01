import { useEffect, useRef, useState } from 'react'

// Video de fondo de la página de inicio. Elige solo cuál mostrar según
// la forma de la pantalla: el vertical en el celular (pantalla parada) y
// el horizontal en la compu o el celular acostado. Si se gira la
// pantalla, cambia al otro.
//
// Mientras el video carga se ve su primera imagen ("poster"), así nunca
// queda un fondo vacío. Si el celular tiene pedido "reducir movimiento"
// o "ahorro de datos", se muestra solo esa imagen (sin descargar el video).
//
// celular / compu: { video, poster } (poster puede faltar).
const FORMA_VERTICAL = '(max-aspect-ratio: 1/1)'

export default function VideoDeFondo({ celular, compu }) {
  const vertical = useCoincide(FORMA_VERTICAL)
  const quieto = useCoincide('(prefers-reduced-motion: reduce)') || ahorroDeDatos()
  const elegido = vertical ? celular : compu
  const referencia = useRef(null)

  // iOS solo reproduce solo un video si está silenciado desde el
  // principio: React no siempre pone el atributo "muted", así que se
  // pone a mano antes de pedirle que arranque.
  useEffect(() => {
    const video = referencia.current
    if (!video) return
    video.muted = true
    video.defaultMuted = true
    video.setAttribute('muted', '')
    const intento = video.play()
    if (intento?.catch) intento.catch(() => {})
  }, [elegido.video, quieto])

  if (quieto || !elegido.video) {
    return elegido.poster ? (
      <img className="portada-fondo" src={elegido.poster} alt="" aria-hidden="true" />
    ) : null
  }

  return (
    <video
      key={elegido.video}
      ref={referencia}
      className="portada-fondo"
      src={elegido.video}
      poster={elegido.poster || undefined}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      disablePictureInPicture
    />
  )
}

function useCoincide(consulta) {
  const [coincide, setCoincide] = useState(() => coincideAhora(consulta))
  useEffect(() => {
    if (!window.matchMedia) return undefined
    const lista = window.matchMedia(consulta)
    const alCambiar = () => setCoincide(lista.matches)
    alCambiar()
    lista.addEventListener?.('change', alCambiar)
    return () => lista.removeEventListener?.('change', alCambiar)
  }, [consulta])
  return coincide
}

function coincideAhora(consulta) {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(consulta).matches)
}

function ahorroDeDatos() {
  return typeof navigator !== 'undefined' && Boolean(navigator.connection?.saveData)
}
