import { useState } from 'react'
import { mostrarAviso } from '../services/avisos.js'

// "Cartel con QR": baja un PDF para imprimir con el QR que lleva al
// registro con el código del espacio (services/cartelQR.js). Lo usan el
// dueño del gimnasio (Equipo) y el profe (Mis espacios).
//   nombre: cómo se presenta en el cartel ("FitCenter", "Facu").
export default function BotonCartelQR({
  nombre,
  codigo,
  className = 'boton-secundario boton-chico',
}) {
  const [armando, setArmando] = useState(false)

  async function bajar() {
    setArmando(true)
    try {
      const { descargarCartel } = await import('../services/cartelQR.js')
      await descargarCartel({ nombre, codigo })
    } catch {
      mostrarAviso('No pudimos armar el cartel. Probá de nuevo.', 'error')
    }
    setArmando(false)
  }

  if (!codigo) return null
  return (
    <button type="button" className={className} onClick={bajar} disabled={armando}>
      {armando ? 'Armando el cartel…' : 'Cartel con QR para imprimir'}
    </button>
  )
}
