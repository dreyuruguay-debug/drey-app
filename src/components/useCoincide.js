import { useEffect, useState } from 'react'

// true mientras la pantalla cumple una condición de CSS (por ejemplo
// '(min-width: 1024px)' o '(prefers-reduced-motion: reduce)'), y se
// actualiza sola si cambia (girar el celular, achicar la ventana). La usan
// la portada (video de fondo), el carrusel de avisos del alumno y los
// Ajustes del Admin.
export function useCoincide(consulta) {
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

export function coincideAhora(consulta) {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(consulta).matches)
}

// Las mismas medidas que usa el CSS.
export const PANTALLA_COMPU = '(min-width: 1024px)'
export const MOVIMIENTO_REDUCIDO = '(prefers-reduced-motion: reduce)'
