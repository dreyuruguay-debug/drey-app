import { useEffect, useRef, useState } from 'react'
import { formatearReloj } from '../../utils/entrenamiento.js'
import { bip, prepararSonido } from '../../utils/sonido.js'

// Segundos para acomodarse antes de que empiece a contar (ponerse en
// posición de plancha, colgarse de la barra...).
const SEGUNDOS_DE_PREPARACION = 5
const REFRESCO_MS = 100
const VIBRACION_ARRANCA = 150
const VIBRACION_TERMINA = [300, 150, 300]

// Cronómetro de una serie por tiempo (plancha: 6 segundos). Va en la
// serie que toca, en PantallaEjercicio.jsx.
//
//   1. "▶ Empezar cronómetro": cuenta 5 segundos de preparación.
//   2. Cuenta regresiva de los segundos de la serie (con vibración y un
//      bip al arrancar y al terminar).
//   3. Al llegar a cero avisa y la serie queda hecha sola
//      (onTerminado(segundos)): arranca el descanso como en cualquier serie.
//   · "Parar": si no llegó, la serie queda hecha con los segundos que
//     aguantó (si paró antes de 1 segundo, no se anota nada).
//   · "Cancelar" (en la preparación): vuelve a como estaba.
//
// Se calcula contra la hora, así no se atrasa si el celular traba la
// pantalla un instante.
//   objetivo: los segundos de la serie. calentamiento: pinta en amarillo.
export default function CronometroDeSerie({ objetivo, calentamiento = false, onTerminado }) {
  // null = sin arrancar; { fase: 'preparando' | 'corriendo', hasta } (ms).
  const [estado, setEstado] = useState(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const total = Math.max(1, Number(objetivo) || 0)
  // Lo último recibido, para usarlo desde el reloj sin reiniciarlo.
  const alTerminar = useRef(onTerminado)
  alTerminar.current = onTerminado

  useEffect(() => {
    if (!estado) return undefined
    const intervalo = setInterval(() => setAhora(Date.now()), REFRESCO_MS)
    return () => clearInterval(intervalo)
  }, [estado])

  const restanteMs = estado ? Math.max(0, estado.hasta - ahora) : 0

  // Cambios de fase cuando una cuenta llega a cero.
  useEffect(() => {
    if (!estado || restanteMs > 0) return
    if (estado.fase === 'preparando') {
      navigator.vibrate?.(VIBRACION_ARRANCA)
      bip(880)
      const inicio = Date.now()
      setAhora(inicio)
      setEstado({ fase: 'corriendo', hasta: inicio + total * 1000 })
      return
    }
    navigator.vibrate?.(VIBRACION_TERMINA)
    bip(1320, 0.5)
    setEstado(null)
    alTerminar.current(total)
  }, [estado, restanteMs, total])

  function empezar() {
    prepararSonido()
    const inicio = Date.now()
    setAhora(inicio)
    setEstado({ fase: 'preparando', hasta: inicio + SEGUNDOS_DE_PREPARACION * 1000 })
  }

  // Paró antes de llegar: se anotan los segundos enteros que aguantó.
  function parar() {
    const aguanto = Math.floor(total - restanteMs / 1000)
    setEstado(null)
    if (aguanto >= 1) alTerminar.current(aguanto)
  }

  if (!estado) {
    return (
      <button
        type="button"
        className={calentamiento ? 'boton-principal boton-calentamiento' : 'boton-principal'}
        onClick={empezar}
      >
        ▶ Empezar cronómetro ({total} seg)
      </button>
    )
  }

  const preparando = estado.fase === 'preparando'
  const segundos = Math.ceil(restanteMs / 1000)
  const avance = preparando ? 0 : 1 - restanteMs / (total * 1000)

  return (
    <div
      className={preparando ? 'cronometro-serie cronometro-serie-preparando' : 'cronometro-serie'}
      role="timer"
      aria-live="off"
    >
      <span className="cronometro-serie-etiqueta">
        {preparando ? 'Preparate…' : '¡Aguantá!'}
      </span>
      <strong className="cronometro-serie-numero">
        {preparando ? segundos : formatearReloj(segundos)}
      </strong>
      <span className="cronometro-serie-barra" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(0, avance * 100))}%` }} />
      </span>
      <button
        type="button"
        className="boton-secundario"
        onClick={preparando ? () => setEstado(null) : parar}
      >
        {preparando ? 'Cancelar' : '■ Parar (anota lo que aguantaste)'}
      </button>
    </div>
  )
}
