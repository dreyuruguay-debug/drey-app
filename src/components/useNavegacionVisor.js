import { useEffect, useRef } from 'react'

// Lo que comparten los visores a pantalla completa (GIF de ejercicios,
// fotos de progreso): mientras están abiertos la página de atrás no se
// mueve; Esc cierra; las flechas del teclado y deslizar el dedo pasan al
// anterior / siguiente; y la imagen siguiente se va descargando.
//
// Devuelve { hayAnterior, haySiguiente, gestos } — "gestos" se pone en la
// caja del visor ({...gestos}) para deslizar con el dedo.
export function useNavegacionVisor({ cantidad, indice, onCambiar, onCerrar, siguienteUrl }) {
  const inicioToque = useRef(null)
  const hayAnterior = indice > 0
  const haySiguiente = indice < cantidad - 1

  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [])

  useEffect(() => {
    function alApretarTecla(event) {
      if (event.key === 'Escape') onCerrar()
      if (event.key === 'ArrowLeft' && hayAnterior) onCambiar(indice - 1)
      if (event.key === 'ArrowRight' && haySiguiente) onCambiar(indice + 1)
    }
    window.addEventListener('keydown', alApretarTecla)
    return () => window.removeEventListener('keydown', alApretarTecla)
  }, [indice, hayAnterior, haySiguiente, onCambiar, onCerrar])

  useEffect(() => {
    if (siguienteUrl) new Image().src = siguienteUrl
  }, [siguienteUrl])

  const gestos = {
    onTouchStart(event) {
      inicioToque.current = event.touches[0]?.clientX ?? null
    },
    onTouchEnd(event) {
      if (inicioToque.current === null) return
      const distancia = (event.changedTouches[0]?.clientX ?? 0) - inicioToque.current
      inicioToque.current = null
      if (distancia > 50 && hayAnterior) onCambiar(indice - 1)
      if (distancia < -50 && haySiguiente) onCambiar(indice + 1)
    },
  }

  return { hayAnterior, haySiguiente, gestos }
}
