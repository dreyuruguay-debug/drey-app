import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { elegirEspacio, nombreDeEspacio, useEspacios } from '../services/espacio.js'

// Selector de espacio, arriba del panel (tipo Google): "Tus alumnos" /
// "FitCenter" / "Gimnasio Las Piedras". Cambia con un toque, sin cerrar
// sesión, y el panel pasa a mostrar lo de ese espacio (services/espacio.js).
// Solo aparece si el profe trabaja en más de un espacio.
const ROLES = { dueno: 'Dueño', profe: 'Profe' }

export default function SelectorEspacio() {
  const { espacios, activo } = useEspacios()
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)
  const navigate = useNavigate()

  // Se cierra tocando afuera o con Escape.
  useEffect(() => {
    if (!abierto) return undefined
    const alTocar = (event) => {
      if (caja.current && !caja.current.contains(event.target)) setAbierto(false)
    }
    const alTeclear = (event) => event.key === 'Escape' && setAbierto(false)
    document.addEventListener('pointerdown', alTocar)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('pointerdown', alTocar)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto])

  if (!espacios || espacios.length < 2 || !activo) return null

  function elegir(id) {
    setAbierto(false)
    if (id === activo.id) return
    // Primero al Inicio (lo de una pantalla del otro espacio no existe en
    // este), después el cambio: las pantallas se vuelven a cargar solas.
    navigate('/profe')
    elegirEspacio(id)
  }

  return (
    <div className="selector-espacio" ref={caja}>
      <button
        type="button"
        className="selector-espacio-boton"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((valor) => !valor)}
      >
        <span className="selector-espacio-textos">
          <small>Estás en</small>
          <strong>{nombreDeEspacio(activo)}</strong>
        </span>
        <span className="selector-espacio-flecha" aria-hidden="true">
          ▾
        </span>
      </button>

      {abierto && (
        <ul className="selector-espacio-lista" role="listbox" aria-label="Elegí un espacio">
          {espacios.map((espacio) => {
            const elegido = espacio.id === activo.id
            return (
              <li key={espacio.id} role="option" aria-selected={elegido}>
                <button
                  type="button"
                  className={
                    elegido
                      ? 'selector-espacio-opcion selector-espacio-elegido'
                      : 'selector-espacio-opcion'
                  }
                  onClick={() => elegir(espacio.id)}
                >
                  <span className="selector-espacio-textos">
                    <strong>{nombreDeEspacio(espacio)}</strong>
                    <small>
                      {espacio.tipo === 'profe' ? 'Tus alumnos particulares' : 'Gimnasio'} ·{' '}
                      {ROLES[espacio.rol] || espacio.rol}
                    </small>
                  </span>
                  {elegido && (
                    <span className="selector-espacio-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
