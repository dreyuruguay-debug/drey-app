import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FormularioIngreso from '../FormularioIngreso.jsx'

// "Iniciar sesión" de la página de inicio (pages/Portada.jsx): una hoja
// que sube desde abajo, encima del video, con el email y la contraseña
// (components/FormularioIngreso.jsx). El video y los botones quedan a la
// vista, apenas oscurecidos detrás.
//
// En la compu (pantallas anchas) es la misma hoja, centrada.
//
// Al abrirse pone el cursor en el email (en el celular abre el teclado,
// porque la persona acaba de tocar "Iniciar sesión"). Se cierra con la ✕,
// tocando lo oscuro de atrás o con Escape; al cerrarse el cursor vuelve al
// botón que la abrió. Mientras está abierta, la página
// de atrás no se mueve. En el celular, cuando aparece el teclado, la hoja
// sube con él para que "Entrar" siga a la vista (useAlturaDelTeclado).
//
//   abierta: si se ve. onCerrar: la cierra.
export default function HojaIngreso({ abierta, onCerrar }) {
  const navigate = useNavigate()
  const teclado = useAlturaDelTeclado(abierta)
  useFondoQuieto(abierta)
  const hoja = useRef(null)
  useFocoAlAbrir(abierta, hoja)

  if (!abierta) return null

  // Escape cierra; Tab da la vuelta dentro de la hoja (no se va a la
  // página de atrás).
  function alApretarTecla(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCerrar()
      return
    }
    if (event.key !== 'Tab') return
    const enfocables = [...event.currentTarget.querySelectorAll(ENFOCABLES)]
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
    <div className="hoja-ingreso-capa" onKeyDown={alApretarTecla}>
      <button
        type="button"
        className="hoja-ingreso-fondo"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onCerrar}
      />
      <section
        ref={hoja}
        className="hoja-ingreso"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hoja-ingreso-titulo"
        style={{ '--hoja-teclado': `${teclado}px` }}
      >
        <span className="hoja-ingreso-agarre" aria-hidden="true" />
        <header className="hoja-ingreso-cabecera">
          <h2 id="hoja-ingreso-titulo" className="hoja-ingreso-titulo">
            Iniciar sesión
          </h2>
          <button type="button" className="hoja-ingreso-cerrar" aria-label="Cerrar" onClick={onCerrar}>
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
        <FormularioIngreso onRegistrarme={() => navigate('/registro')} />
      </section>
    </div>
  )
}

const ENFOCABLES = '.hoja-ingreso button:not([disabled]), .hoja-ingreso input'

// Cuánto tapa el teclado del celular (en px), para subir la hoja por
// encima. Usa visualViewport (lo que se ve de la página): si es más bajo
// que la ventana, la diferencia es el teclado. Sin visualViewport, 0.
function useAlturaDelTeclado(activo) {
  const [alto, setAlto] = useState(0)
  useEffect(() => {
    const vista = window.visualViewport
    if (!activo || !vista) return undefined
    function medir() {
      setAlto(Math.max(0, Math.round(window.innerHeight - vista.height - vista.offsetTop)))
    }
    medir()
    vista.addEventListener('resize', medir)
    vista.addEventListener('scroll', medir)
    return () => {
      vista.removeEventListener('resize', medir)
      vista.removeEventListener('scroll', medir)
      setAlto(0)
    }
  }, [activo])
  return alto
}

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

// Al abrir, el cursor va al primer campo (el email). Al cerrar, vuelve a
// donde estaba (el botón "Iniciar sesión"), para quien usa teclado o
// lector de pantalla.
function useFocoAlAbrir(activo, hoja) {
  const anterior = useRef(null)
  useEffect(() => {
    if (!activo) return undefined
    anterior.current = document.activeElement
    hoja.current?.querySelector('input')?.focus({ preventScroll: true })
    return () => {
      const elemento = anterior.current
      if (elemento && typeof elemento.focus === 'function' && document.contains(elemento)) {
        elemento.focus({ preventScroll: true })
      }
    }
  }, [activo, hoja])
}
