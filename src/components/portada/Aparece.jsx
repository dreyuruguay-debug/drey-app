import { useEffect, useRef, useState } from 'react'

// Hace que una sección de la página de inicio aparezca suave (sube un
// poquito y se aclara) cuando entra en la pantalla al bajar. Aparece una
// sola vez. Si el navegador no sabe avisar cuándo entra, o el celular
// tiene pedido "reducir movimiento", se muestra directo, sin efecto.
export default function Aparece({ as: Etiqueta = 'div', className = '', children, ...resto }) {
  const referencia = useRef(null)
  const [visto, setVisto] = useState(() => !puedeAnimar())

  useEffect(() => {
    if (visto) return undefined
    const elemento = referencia.current
    if (!elemento) return undefined
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) {
          setVisto(true)
          observador.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [visto])

  const clases = ['aparece', visto ? 'aparece-visto' : '', className].filter(Boolean).join(' ')
  return (
    <Etiqueta ref={referencia} className={clases} {...resto}>
      {children}
    </Etiqueta>
  )
}

function puedeAnimar() {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return false
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
