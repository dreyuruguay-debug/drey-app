import { useEffect, useState } from 'react'
import { formatearReloj } from '../../utils/entrenamiento.js'
import { relojCorriendo, segundosDeReloj } from '../../utils/reloj.js'

// Tiempo que lleva el entrenamiento ("18:42"). Tiene su propio reloj,
// así el resto de la pantalla no se vuelve a dibujar cada segundo.
// reloj: ver utils/reloj.js. Parado (en pausa o antes de empezar) no
// avanza.
export default function Cronometro({ reloj }) {
  const corriendo = relojCorriendo(reloj)
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    if (!corriendo) return undefined
    setAhora(Date.now())
    const intervalo = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(intervalo)
  }, [corriendo, reloj?.desde])

  return (
    <span className="entrenar-cronometro" aria-label="Tiempo de entrenamiento">
      {formatearReloj(segundosDeReloj(reloj, corriendo ? ahora : Date.now()))}
    </span>
  )
}
