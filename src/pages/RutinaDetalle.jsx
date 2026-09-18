import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'
import { RUTINAS } from '../data/rutinas.js'

// Pantalla de una rutina en curso (Rutina A, B o C). Los ejercicios, sus
// series/reps/peso objetivo y las opciones de descanso los carga el
// profe desde su panel — todavía no construido. Los datos viven en
// src/data/rutinas.js para que esta pantalla, Rutinas e Inicio usen
// siempre la misma información.
const OPCIONES_DESCANSO = [30, 60, 90, 120]
const CANTIDAD_SERIES = 4
const PASO_KG = 2.5
const PASO_REPS = 1

export default function RutinaDetalle() {
  const { id } = useParams()
  const rutina = RUTINAS[id]

  const [descansoElegido, setDescansoElegido] = useState(60)
  const [tiempoRestante, setTiempoRestante] = useState(null)
  const [series, setSeries] = useState(() => crearSeriesIniciales(rutina))
  const [esfuerzo, setEsfuerzo] = useState(null)
  const [comentario, setComentario] = useState('')
  const [finalizada, setFinalizada] = useState(false)

  // Cuenta regresiva del descanso.
  useEffect(() => {
    if (tiempoRestante === null || tiempoRestante <= 0) return undefined
    const intervalo = setInterval(() => {
      setTiempoRestante((valor) => (valor === null ? null : valor - 1))
    }, 1000)
    return () => clearInterval(intervalo)
  }, [tiempoRestante])

  if (!rutina) {
    return (
      <div className="screen">
        <p style={{ padding: '2rem' }}>No encontramos esa rutina.</p>
        <Link to="/rutinas" className="auth-switch">
          Volver a rutinas
        </Link>
      </div>
    )
  }

  function marcarSerie(exIndex, serieIndex) {
    setSeries((actual) => {
      const copia = actual.map((filas) => filas.map((fila) => ({ ...fila })))
      copia[exIndex][serieIndex].hecha = !copia[exIndex][serieIndex].hecha
      return copia
    })
    // Al marcar una serie arranca el temporizador de descanso elegido.
    setTiempoRestante(descansoElegido)
  }

  function ajustarValor(exIndex, serieIndex, campo, delta) {
    setSeries((actual) => {
      const copia = actual.map((filas) => filas.map((fila) => ({ ...fila })))
      const fila = copia[exIndex][serieIndex]
      const nuevoValor = Number(fila[campo]) + delta
      fila[campo] = nuevoValor < 0 ? 0 : nuevoValor
      return copia
    })
  }

  function agregarDescanso(segundos) {
    setTiempoRestante((valor) => (valor === null ? null : valor + segundos))
  }

  function saltarDescanso() {
    setTiempoRestante(null)
  }

  function handleFinalizar() {
    setFinalizada(true)
  }

  // Primera serie sin marcar de cada ejercicio: es la "fila actual", la
  // próxima que el cliente tiene que hacer.
  function indiceFilaActual(exIndex) {
    return series[exIndex].findIndex((fila) => !fila.hecha)
  }

  const mostrarTimer = tiempoRestante !== null && tiempoRestante > 0

  return (
    <div className={mostrarTimer ? 'screen screen-con-descanso' : 'screen'}>
      <TopPattern />

      <div className="rutina-detalle-header">
        <div className="cliente-header-col">
          <Link to="/rutinas" className="rutina-detalle-volver">
            ← Rutinas
          </Link>
          <p className="cliente-header-goal">
            {rutina.patron} · {rutina.musculos}
          </p>
        </div>

        <div className="cliente-header-col cliente-header-center">
          <p className="rutina-detalle-titulo">{rutina.nombre}</p>
          <p className="cliente-header-plan">Plan seguimiento</p>
        </div>
      </div>

      {rutina.ejercicios.map((ejercicio, exIndex) => {
        const filaActual = indiceFilaActual(exIndex)
        return (
          <div key={ejercicio.nombre} className="ejercicio-bloque">
            <div className="ejercicio-header">
              <span>{ejercicio.nombre}</span>
              <button
                type="button"
                className="ejercicio-video-link"
                onClick={() => window.alert('Acá va a ir el video o GIF del ejercicio.')}
              >
                Ver cómo se hace ▶
              </button>
            </div>

            <p className="ejercicio-objetivo">Objetivo: {ejercicio.objetivoTexto}</p>

            <div className="descanso-opciones">
              <span className="descanso-opciones-label">Descanso:</span>
              {OPCIONES_DESCANSO.map((segundos) => (
                <button
                  key={segundos}
                  type="button"
                  className={
                    segundos === descansoElegido
                      ? 'descanso-chip descanso-chip-activo'
                      : 'descanso-chip'
                  }
                  onClick={() => setDescansoElegido(segundos)}
                >
                  {segundos}s
                </button>
              ))}
            </div>

            <table className="ejercicio-tabla">
              <thead>
                <tr>
                  <th>Serie</th>
                  <th>Anterior</th>
                  <th>Kg</th>
                  <th>Reps</th>
                  <th>✓</th>
                </tr>
              </thead>
              <tbody>
                {series[exIndex].map((fila, serieIndex) => {
                  const esActual = serieIndex === filaActual
                  const claseFila = fila.hecha ? 'fila-hecha' : esActual ? 'fila-actual' : ''
                  return (
                    <tr key={serieIndex} className={claseFila}>
                      <td>{serieIndex + 1}</td>
                      <td className="ejercicio-tabla-anterior">{ejercicio.anterior}</td>
                      <td>
                        <div className="stepper">
                          <button
                            type="button"
                            className="stepper-btn"
                            onClick={() => ajustarValor(exIndex, serieIndex, 'kg', -PASO_KG)}
                            aria-label="Restar kilos"
                          >
                            −
                          </button>
                          <span className="stepper-valor">{fila.kg}</span>
                          <button
                            type="button"
                            className="stepper-btn"
                            onClick={() => ajustarValor(exIndex, serieIndex, 'kg', PASO_KG)}
                            aria-label="Sumar kilos"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="stepper">
                          <button
                            type="button"
                            className="stepper-btn"
                            onClick={() => ajustarValor(exIndex, serieIndex, 'reps', -PASO_REPS)}
                            aria-label="Restar repeticiones"
                          >
                            −
                          </button>
                          <span className="stepper-valor">{fila.reps}</span>
                          <button
                            type="button"
                            className="stepper-btn"
                            onClick={() => ajustarValor(exIndex, serieIndex, 'reps', PASO_REPS)}
                            aria-label="Sumar repeticiones"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={
                            fila.hecha ? 'serie-check serie-check-hecha' : 'serie-check'
                          }
                          onClick={() => marcarSerie(exIndex, serieIndex)}
                          aria-label={`Marcar serie ${serieIndex + 1} como hecha`}
                        >
                          ✓
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      <div className="cierre-rutina">
        {finalizada ? (
          <>
            <p className="cierre-rutina-gracias">¡Rutina guardada! Nos vemos la próxima.</p>
            <Link to="/rutinas" className="pill-button cierre-rutina-volver">
              Volver a rutinas
            </Link>
          </>
        ) : (
          <>
            <p className="cierre-rutina-pregunta">¿Cómo te sentiste?</p>
            <div className="cierre-rutina-esfuerzo">
              {[1, 2, 3, 4, 5].map((valor) => (
                <button
                  key={valor}
                  type="button"
                  className={
                    esfuerzo === valor
                      ? 'esfuerzo-chip esfuerzo-chip-activo'
                      : 'esfuerzo-chip'
                  }
                  onClick={() => setEsfuerzo(valor)}
                >
                  {valor}
                </button>
              ))}
            </div>
            <textarea
              className="cierre-rutina-comentario"
              placeholder="Comentario (opcional)"
              value={comentario}
              onChange={(event) => setComentario(event.target.value)}
            />
            <button type="button" className="pill-button" onClick={handleFinalizar}>
              Finalizar rutina
            </button>
          </>
        )}
      </div>

      {mostrarTimer && (
        <div className="rest-timer-bar">
          <div className="rest-timer-info">
            <span className="rest-timer-label">Descanso</span>
            <span className="rest-timer-valor">{formatearTiempo(tiempoRestante)}</span>
          </div>
          <div className="progress-bar rest-timer-progress">
            <div
              className="progress-fill"
              style={{ width: `${(tiempoRestante / descansoElegido) * 100}%` }}
            />
          </div>
          <div className="rest-timer-acciones">
            <button type="button" className="rest-timer-btn" onClick={() => agregarDescanso(15)}>
              +15s
            </button>
            <button type="button" className="rest-timer-btn" onClick={saltarDescanso}>
              Saltar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function crearSeriesIniciales(rutina) {
  if (!rutina) return []
  return rutina.ejercicios.map((ejercicio) =>
    Array.from({ length: CANTIDAD_SERIES }, () => ({
      kg: ejercicio.kgObjetivo,
      reps: ejercicio.repsObjetivo,
      hecha: false,
    }))
  )
}

function formatearTiempo(segundos) {
  const mm = String(Math.floor(segundos / 60)).padStart(2, '0')
  const ss = String(segundos % 60).padStart(2, '0')
  return `${mm}:${ss}`
}
