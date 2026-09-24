import { useEffect, useState } from 'react'
import { formatearReloj } from '../../utils/entrenamiento.js'

// Tiempo que lleva el entrenamiento ("18:42"). Tiene su propio reloj,
// así el resto de la pantalla no se vuelve a dibujar cada segundo.
export default function Cronometro({ desde }) {
  const [ahora, setAhora] = useState(Date.now())

  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(intervalo)
  }, [])

  return (
    <span className="entrenar-cronometro" aria-label="Tiempo de entrenamiento">
      {formatearReloj((ahora - desde) / 1000)}
    </span>
  )
}
