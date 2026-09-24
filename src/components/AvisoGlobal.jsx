import { useEffect, useState } from 'react'
import { EVENTO_AVISO } from '../services/avisos.js'

const DURACION_MS = 2400

// Aviso corto que aparece abajo de la pantalla ("✓ Guardado") cada vez
// que alguna pantalla llama a mostrarAviso(). Se monta una sola vez, en App.
export default function AvisoGlobal() {
  const [aviso, setAviso] = useState(null)

  useEffect(() => {
    let temporizador = null
    function alRecibir(evento) {
      setAviso({ ...evento.detail, clave: Date.now() })
      clearTimeout(temporizador)
      temporizador = setTimeout(() => setAviso(null), DURACION_MS)
    }
    window.addEventListener(EVENTO_AVISO, alRecibir)
    return () => {
      window.removeEventListener(EVENTO_AVISO, alRecibir)
      clearTimeout(temporizador)
    }
  }, [])

  if (!aviso) return null
  return (
    <div
      key={aviso.clave}
      className={aviso.tipo === 'error' ? 'aviso-global aviso-global-error' : 'aviso-global'}
      role="status"
    >
      <span className="aviso-global-icono" aria-hidden="true">
        {aviso.tipo === 'error' ? '!' : '✓'}
      </span>
      {aviso.texto}
    </div>
  )
}
