import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import HojaInferior from './HojaInferior.jsx'
import Icono from './Icono.jsx'

// "Atajos de teclado" del panel en la compu: un botón al pie de la barra
// lateral (ProfeLayout) que abre la lista. También se abre con la tecla
// "?" (si no se está escribiendo en un casillero).
const ATAJOS = [
  { teclas: ['Ctrl', 'K'], texto: 'Buscar alumnos, rutinas y pantallas' },
  { teclas: ['Alt', 'N'], texto: 'Agregar ejercicios (en el editor de rutinas)' },
  {
    teclas: ['Ctrl', 'Enter'],
    texto: 'Guardar la rutina, o el bloque si estás agregando ejercicios',
  },
  { teclas: ['Enter'], texto: 'Pasar al casillero siguiente (al agregar ejercicios)' },
  { teclas: ['Esc'], texto: 'Cerrar la ventana abierta' },
  { teclas: ['?'], texto: 'Ver esta lista' },
]

export default function AtajosDeTeclado() {
  const [abierta, setAbierta] = useState(false)

  useEffect(() => {
    function alApretarTecla(event) {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return
      const campo = event.target
      if (campo.closest?.('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      setAbierta(true)
    }
    window.addEventListener('keydown', alApretarTecla)
    return () => window.removeEventListener('keydown', alApretarTecla)
  }, [])

  return (
    <>
      <button
        type="button"
        className="bottom-nav-item panel-solo-compu atajos-boton"
        onClick={() => setAbierta(true)}
      >
        <Icono nombre="teclado" tamano={22} />
        <span>Atajos de teclado</span>
      </button>
      {/* Fuera del menú (que tiene su propia capa), para que tape todo. */}
      {createPortal(
        <HojaInferior
          abierta={abierta}
          onCerrar={() => setAbierta(false)}
          titulo="Atajos de teclado"
          id="atajos-de-teclado"
        >
          <dl className="atajos-lista">
            {ATAJOS.map((atajo) => (
              <div key={atajo.texto} className="atajos-fila">
                <dt>
                  {atajo.teclas.map((tecla, indice) => (
                    <span key={tecla}>
                      {indice > 0 && ' + '}
                      <kbd>{tecla}</kbd>
                    </span>
                  ))}
                </dt>
                <dd>{atajo.texto}</dd>
              </div>
            ))}
          </dl>
        </HojaInferior>,
        document.body,
      )}
    </>
  )
}
