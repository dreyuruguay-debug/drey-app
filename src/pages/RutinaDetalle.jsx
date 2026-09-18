import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'

// Pantalla de una rutina en curso (Rutina A, B o C). Los ejercicios, sus
// series/reps/peso objetivo y las opciones de descanso los carga el
// profe desde su panel — todavía no construido. Acá van datos de
// ejemplo para mostrar cómo se ve y se usa la pantalla.
const RUTINAS = {
  a: {
    nombre: 'Rutina A',
    patron: 'Patrón de empuje',
    musculos: 'Pectorales, hombros y tríceps · zona media',
    ejercicios: [
      {
        nombre: 'Press banca con barra',
        objetivoTexto: '60kg · 8 reps',
        kgObjetivo: 60,
        repsObjetivo: 8,
        anterior: '58kg · 8 reps',
      },
      {
        nombre: 'Press inclinado con mancuernas',
        objetivoTexto: '22kg · 10 reps',
        kgObjetivo: 22,
        repsObjetivo: 10,
        anterior: '20kg · 10 reps',
      },
    ],
  },
  b: {
    nombre: 'Rutina B',
    patron: 'Patrón de tracción',
    musculos: 'Espalda, bíceps y trapecios · zona media',
    ejercicios: [
      {
        nombre: 'Remo con barra',
        objetivoTexto: '50kg · 10 reps',
        kgObjetivo: 50,
        repsObjetivo: 10,
        anterior: '47.5kg · 10 reps',
      },
    ],
  },
  c: {
    nombre: 'Rutina C',
    patron: 'Full piernas',
    musculos: 'Glúteos, cuádriceps y femorales · zona media + cardio',
    ejercicios: [
      {
        nombre: 'Sentadilla',
        objetivoTexto: '70kg · 8 reps',
        kgObjetivo: 70,
        repsObjetivo: 8,
        anterior: '65kg · 8 reps',
      },
    ],
  },
}

const OPCIONES_DESCANSO = [30, 60, 90, 120]
const CANTIDAD_SERIES = 4

export default function RutinaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
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

  function actualizarValor(exIndex, serieIndex, campo, valor) {
    setSeries((actual) => {
      const copia = actual.map((filas) => filas.map((fila) => ({ ...fila })))
      copia[exIndex][serieIndex][campo] = valor
      return copia
    })
  }

  function handleFinalizar() {
    setFinalizada(true)
  }

  return (
    <div className="screen">
      <TopPattern />

      <div className="rutina-detalle-header">
        <div className="cliente-header-col">
          <p className="cliente-header-week">{rutina.patron}</p>
          <p className="cliente-header-goal">{rutina.musculos}</p>
        </div>

        <div className="cliente-header-col cliente-header-center">
          <p className="rutina-detalle-titulo">{rutina.nombre}</p>
          <p className="cliente-header-plan">Plan seguimiento</p>
        </div>

        <div className="cliente-header-col cliente-header-right">
          <p className="rutina-detalle-timer">
            {tiempoRestante !== null ? formatearTiempo(tiempoRestante) : '00:00'}
          </p>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: tiempoRestante
                  ? `${(tiempoRestante / descansoElegido) * 100}%`
                  : '0%',
              }}
            />
          </div>
          <p className="rutina-detalle-descanso-label">Descanso</p>
        </div>
      </div>

      {rutina.ejercicios.map((ejercicio, exIndex) => (
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
              {series[exIndex].map((fila, serieIndex) => (
                <tr key={serieIndex}>
                  <td>{serieIndex + 1}</td>
                  <td className="ejercicio-tabla-anterior">{ejercicio.anterior}</td>
                  <td>
                    <input
                      type="number"
                      className="ejercicio-tabla-input"
                      value={fila.kg}
                      onChange={(event) =>
                        actualizarValor(exIndex, serieIndex, 'kg', event.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="ejercicio-tabla-input"
                      value={fila.reps}
                      onChange={(event) =>
                        actualizarValor(exIndex, serieIndex, 'reps', event.target.value)
                      }
                    />
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
              ))}
            </tbody>
          </table>
        </div>
      ))}

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
