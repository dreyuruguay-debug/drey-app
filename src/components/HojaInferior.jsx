import { useEffect, useRef } from 'react'

// Hoja que sube desde abajo (en la compu, centrada), con título y ✕.
// La usan "Iniciar sesión" de la página de inicio
// (components/portada/HojaIngreso.jsx) y la guía para instalar DREY
// (components/instalar/GuiaInstalacion.jsx).
//
// Se cierra con la ✕, tocando lo oscuro de atrás o con Escape. Mientras
// está abierta, la página de atrás no se mueve y Tab da la vuelta dentro
// de la hoja. Al cerrarse, el cursor vuelve al botón que la abrió (para
// quien usa teclado o lector de pantalla).
//
//   abierta, onCerrar: si se ve y cómo se cierra.
//   titulo:            el título grande de arriba.
//   id:                nombre único (para que el lector de pantalla lea el título).
//   enfocarCampo:      true → al abrir, el cursor va al primer campo (en el
//                      celular abre el teclado). Si no, va a la hoja.
//   estilo:            estilos extra (HojaIngreso pasa la altura del teclado).
export default function HojaInferior({
  abierta,
  onCerrar,
  titulo,
  id,
  enfocarCampo = false,
  estilo,
  children,
}) {
  const hoja = useRef(null)
  useFondoQuieto(abierta)
  useFocoAlAbrir(abierta, hoja, enfocarCampo)

  if (!abierta) return null

  function alApretarTecla(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCerrar()
      return
    }
    if (event.key !== 'Tab') return
    const enfocables = [...hoja.current.querySelectorAll(ENFOCABLES)]
    if (!enfocables.length) return
    const primero = enfocables[0]
    const ultimo = enfocables[enfocables.length - 1]
    if (event.shiftKey && document.activeElement === primero) {
      event.preventDefault()
      ultimo.focus()
    } else if (!event.shiftKey && document.activeElement === ultimo) {
      event.preventDefault()
      primero.focus()
    }
  }

  return (
    <div className="hoja-inferior-capa" onKeyDown={alApretarTecla}>
      <button
        type="button"
        className="hoja-inferior-fondo"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onCerrar}
      />
      <section
        ref={hoja}
        className="hoja-inferior"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        tabIndex={-1}
        style={estilo}
      >
        <span className="hoja-inferior-agarre" aria-hidden="true" />
        <header className="hoja-inferior-cabecera">
          <h2 id={`${id}-titulo`} className="hoja-inferior-titulo">
            {titulo}
          </h2>
          <button
            type="button"
            className="hoja-inferior-cerrar"
            aria-label="Cerrar"
            onClick={onCerrar}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

const ENFOCABLES = 'button:not([disabled]), input, a[href]'

// Mientras la hoja está abierta, la página de atrás no se desplaza.
function useFondoQuieto(activo) {
  useEffect(() => {
    if (!activo) return undefined
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [activo])
}

// Al abrir, el cursor va al primer campo (o a la hoja). Al cerrar, vuelve
// a donde estaba.
function useFocoAlAbrir(activo, hoja, enfocarCampo) {
  const anterior = useRef(null)
  useEffect(() => {
    if (!activo) return undefined
    anterior.current = document.activeElement
    const destino = (enfocarCampo && hoja.current?.querySelector('input')) || hoja.current
    destino?.focus({ preventScroll: true })
    return () => {
      const elemento = anterior.current
      if (elemento && typeof elemento.focus === 'function' && document.contains(elemento)) {
        elemento.focus({ preventScroll: true })
      }
    }
  }, [activo, hoja, enfocarCampo])
}
