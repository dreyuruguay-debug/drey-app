import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'
import { supabase } from '../services/supabaseClient.js'
import { obtenerFechaHoyISO } from '../utils/dias.js'
import { agruparEnBloques, tituloDeBloque } from '../utils/bloques.js'
import { obtenerMetodo } from '../data/metodos.js'
import InfoMetodo from '../components/InfoMetodo.jsx'

// Pantalla de una rutina en curso (Rutina A, B o C). Los ejercicios, sus
// series/reps/peso objetivo y las opciones de descanso los carga el
// profe desde su panel, en las tablas "rutinas" y "rutina_ejercicios".
//
// Al tocar "Finalizar rutina" se guarda una sesión real en la tabla
// "sesiones", con el kg/reps de cada serie. La próxima vez que el
// cliente entra a esta misma rutina, esos datos aparecen en la columna
// "Anterior".
//
// Mientras el cliente entrena, la pantalla del celular se mantiene
// encendida (Screen Wake Lock) para no tener que desbloquearla entre
// serie y serie, y cada serie marcada se compara contra el mejor
// resultado histórico de ese ejercicio (en cualquier rutina) para
// avisar si es un récord personal nuevo.
//
// Los ejercicios vienen agrupados en bloques según el método que eligió
// el profe (ver src/utils/bloques.js). En una biserie, triserie o
// circuito, el descanso arranca recién al marcar el último ejercicio
// del bloque; en los anteriores se le avisa que siga con el próximo.
const DESCANSOS_POR_DEFECTO = [30, 60, 90, 120]
const CANTIDAD_SERIES_POR_DEFECTO = 4
const PASO_KG = 2.5
const PASO_REPS = 1
const DURACION_AVISO_RECORD_MS = 4000
const DURACION_AVISO_BLOQUE_MS = 2500

export default function RutinaDetalle() {
  const { id } = useParams()

  const [cargando, setCargando] = useState(true)
  const [usuarioId, setUsuarioId] = useState(null)
  const [rutina, setRutina] = useState(null)
  const [ejercicios, setEjercicios] = useState([])
  const [anteriorPorEjercicio, setAnteriorPorEjercicio] = useState({})
  const [mejoresPorEjercicio, setMejoresPorEjercicio] = useState({})

  const [descansoElegido, setDescansoElegido] = useState(60)
  const [tiempoRestante, setTiempoRestante] = useState(null)
  const [series, setSeries] = useState([])
  const [esfuerzo, setEsfuerzo] = useState(null)
  const [comentario, setComentario] = useState('')
  const [finalizada, setFinalizada] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState('')
  const [avisoRecord, setAvisoRecord] = useState(null)
  const [avisoBloque, setAvisoBloque] = useState(null)

  useEffect(() => {
    cargarRutina()
  }, [id])

  // Pide que la pantalla no se apague sola mientras esta pantalla está
  // abierta (el cliente entrenando). Si el navegador no lo soporta, o
  // si el celular bloquea la pantalla igual (pasa cuando la pestaña
  // pierde el foco), no rompe nada: el resto de la app sigue normal.
  useEffect(() => {
    let bloqueo = null
    let cancelado = false

    async function pedirBloqueo() {
      if (!('wakeLock' in navigator)) return
      try {
        const nuevoBloqueo = await navigator.wakeLock.request('screen')
        if (cancelado) {
          nuevoBloqueo.release()
          return
        }
        bloqueo = nuevoBloqueo
      } catch {
        // Algunos navegadores lo rechazan (por ejemplo con batería baja);
        // no hace falta avisarle nada al cliente por esto.
      }
    }

    function alVolverAVerLaPantalla() {
      if (document.visibilityState === 'visible' && !bloqueo) {
        pedirBloqueo()
      }
    }

    pedirBloqueo()
    document.addEventListener('visibilitychange', alVolverAVerLaPantalla)

    return () => {
      cancelado = true
      document.removeEventListener('visibilitychange', alVolverAVerLaPantalla)
      bloqueo?.release()
    }
  }, [])

  async function cargarRutina() {
    setCargando(true)
    const { data: userData } = await supabase.auth.getUser()
    const usuario = userData?.user
    setUsuarioId(usuario?.id || null)

    const [{ data: rutinaData }, { data: ejerciciosData }] = await Promise.all([
      supabase.from('rutinas').select('*').eq('id', id).single(),
      supabase
        .from('rutina_ejercicios')
        .select('*, ejercicios(nombre, video_url, imagen_url)')
        .eq('rutina_id', id)
        .order('orden'),
    ])
    setRutina(rutinaData || null)
    const lista = ejerciciosData || []
    setEjercicios(lista)
    setSeries(crearSeriesIniciales(lista))
    if (lista[0]?.descansos?.[1]) {
      setDescansoElegido(lista[0].descansos[1])
    }

    // Busca la última vez que se hizo esta rutina, para mostrar el
    // kg/reps de cada serie en la columna "Anterior".
    if (usuario) {
      const [{ data: sesionAnterior }, { data: todasLasSesiones }] = await Promise.all([
        supabase
          .from('sesiones')
          .select('detalle')
          .eq('cliente_id', usuario.id)
          .eq('rutina_id', id)
          .order('fecha', { ascending: false })
          .limit(1),
        // Todas las sesiones del cliente (en cualquier rutina), para
        // saber cuál es su mejor marca histórica de cada ejercicio y
        // así poder avisarle si hoy hace un récord nuevo.
        supabase.from('sesiones').select('detalle').eq('cliente_id', usuario.id),
      ])

      const detalle = sesionAnterior?.[0]?.detalle || []
      const mapa = {}
      for (const item of detalle) {
        mapa[item.ejercicio_id] = item.series || []
      }
      setAnteriorPorEjercicio(mapa)

      const mejores = {}
      for (const sesion of todasLasSesiones || []) {
        for (const item of sesion.detalle || []) {
          for (const fila of item.series || []) {
            const kg = Number(fila.kg) || 0
            const reps = Number(fila.reps) || 0
            const actual = mejores[item.ejercicio_id] || { kg: 0, reps: 0 }
            mejores[item.ejercicio_id] = {
              kg: Math.max(actual.kg, kg),
              reps: Math.max(actual.reps, reps),
            }
          }
        }
      }
      setMejoresPorEjercicio(mejores)
    }

    setCargando(false)
  }

  // Cuenta regresiva del descanso.
  useEffect(() => {
    if (tiempoRestante === null || tiempoRestante <= 0) return undefined
    const intervalo = setInterval(() => {
      setTiempoRestante((valor) => (valor === null ? null : valor - 1))
    }, 1000)
    return () => clearInterval(intervalo)
  }, [tiempoRestante])

  if (cargando) {
    return (
      <div className="screen">
        <TopPattern />
        <p className="profe-mensaje-carga">Cargando…</p>
      </div>
    )
  }

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

  const bloques = agruparEnBloques(ejercicios)
  // Para cada ejercicio (por su posición): su bloque y su lugar adentro.
  const ubicacion = {}
  for (const bloque of bloques) {
    bloque.items.forEach(({ indice }, posicion) => {
      ubicacion[indice] = { bloque, posicion }
    })
  }

  function marcarSerie(exIndex, serieIndex) {
    // Se decide con el estado actual (no dentro de setSeries): React no
    // garantiza cuándo corre esa función, y antes eso hacía que a veces
    // el descanso no arrancara.
    const quedoHecha = !series[exIndex][serieIndex].hecha
    setSeries((actual) => {
      const copia = actual.map((filas) => filas.map((fila) => ({ ...fila })))
      copia[exIndex][serieIndex].hecha = quedoHecha
      return copia
    })

    if (!quedoHecha) return

    revisarRecord(exIndex, serieIndex)

    // En un bloque de varios ejercicios, solo se descansa al terminar el
    // último; en los demás se avisa cuál sigue.
    const { bloque, posicion } = ubicacion[exIndex]
    if (posicion < bloque.items.length - 1) {
      const siguiente = bloque.items[posicion + 1].item.ejercicios?.nombre || 'el próximo ejercicio'
      const texto = `Sin descanso: seguí con ${siguiente}`
      setAvisoBloque(texto)
      setTimeout(
        () => setAvisoBloque((actual) => (actual === texto ? null : actual)),
        DURACION_AVISO_BLOQUE_MS,
      )
      return
    }

    // Al marcar una serie arranca el temporizador de descanso elegido.
    setTiempoRestante(descansoElegido)
  }

  // Compara la serie recién marcada contra el mejor resultado histórico
  // de ese ejercicio y, si lo supera, muestra un cartel felicitando al
  // cliente (y actualiza la marca para que el resto de la rutina
  // compare contra el nuevo mejor).
  function revisarRecord(exIndex, serieIndex) {
    const ejercicio = ejercicios[exIndex]
    const ejercicioId = ejercicio?.ejercicio_id
    if (!ejercicioId) return
    const fila = series[exIndex][serieIndex]
    const kg = Number(fila.kg) || 0
    const reps = Number(fila.reps) || 0
    const mejorActual = mejoresPorEjercicio[ejercicioId]

    // Si nunca hizo este ejercicio antes no hay marca previa con qué
    // comparar: no tiene sentido "festejar" el primer intento.
    if (!mejorActual) {
      setMejoresPorEjercicio((actual) => ({ ...actual, [ejercicioId]: { kg, reps } }))
      return
    }

    const nombreEjercicio = ejercicio.ejercicios?.nombre || 'este ejercicio'
    let mensaje = null
    if (kg > mejorActual.kg && kg > 0) {
      mensaje = `🏆 ¡Récord de peso en ${nombreEjercicio}! ${kg} kg`
    } else if (reps > mejorActual.reps && reps > 0) {
      mensaje = `🏆 ¡Récord de repeticiones en ${nombreEjercicio}! ${reps} reps`
    }

    if (mensaje) {
      setAvisoRecord(mensaje)
      setTimeout(
        () => setAvisoRecord((actual) => (actual === mensaje ? null : actual)),
        DURACION_AVISO_RECORD_MS,
      )
    }

    setMejoresPorEjercicio((actual) => ({
      ...actual,
      [ejercicioId]: { kg: Math.max(mejorActual.kg, kg), reps: Math.max(mejorActual.reps, reps) },
    }))
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

  async function handleFinalizar() {
    if (!usuarioId) return
    setGuardando(true)
    setErrorGuardar('')

    const detalle = ejercicios.map((ejercicio, exIndex) => ({
      ejercicio_id: ejercicio.ejercicio_id,
      nombre: ejercicio.ejercicios?.nombre || '',
      metodo: ejercicio.metodo || 'normal',
      series: series[exIndex].map((fila) => ({ kg: fila.kg, reps: fila.reps, hecha: fila.hecha })),
    }))

    const { error } = await supabase.from('sesiones').insert({
      cliente_id: usuarioId,
      rutina_id: rutina.id,
      fecha: obtenerFechaHoyISO(),
      esfuerzo,
      comentario: comentario.trim() || null,
      detalle,
    })

    setGuardando(false)
    if (error) {
      setErrorGuardar('No pudimos guardar la rutina. Probá de nuevo.')
      return
    }
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

      {avisoRecord && (
        <div className="record-banner" role="status">
          {avisoRecord}
        </div>
      )}
      {avisoBloque && !avisoRecord && (
        <div className="record-banner bloque-banner" role="status">
          {avisoBloque}
        </div>
      )}

      <div className="rutina-detalle-header">
        <div className="cliente-header-col">
          <Link to="/rutinas" className="rutina-detalle-volver">
            ← Rutinas
          </Link>
          <p className="cliente-header-goal">
            {[rutina.patron, rutina.musculos].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="cliente-header-col cliente-header-center">
          <p className="rutina-detalle-titulo">{rutina.nombre}</p>
        </div>
      </div>

      {rutina.descripcion && <p className="rutina-descripcion">{rutina.descripcion}</p>}

      {ejercicios.length === 0 ? (
        <p className="profe-vacio" style={{ textAlign: 'center', margin: '2rem 1.5rem' }}>
          Tu profe todavía no le cargó ejercicios a esta rutina.
        </p>
      ) : (
        bloques.map((bloque) => {
          const metodoBloque = obtenerMetodo(bloque.metodo)
          const instruccion = metodoBloque.instruccion(bloque.config || {})
          const esGrupo = bloque.items.length > 1
          const cabecera =
            bloque.metodo !== 'normal' ? (
              <div className="bloque-cabecera">
                <div className="bloque-cabecera-titulo">
                  <span>{tituloDeBloque(bloque)}</span>
                  <InfoMetodo metodoId={bloque.metodo} />
                </div>
                {instruccion && <p className="bloque-instruccion">{instruccion}</p>}
              </div>
            ) : null
          const tarjetas = bloque.items.map(({ item: ejercicio, indice: exIndex }, posicion) => {
            const esUltimoDelBloque = posicion === bloque.items.length - 1
            const filaActual = indiceFilaActual(exIndex)
            const opcionesDescanso = ejercicio.descansos?.length
              ? ejercicio.descansos
              : DESCANSOS_POR_DEFECTO
            return (
              <div key={ejercicio.id} className="ejercicio-bloque">
                {ejercicio.ejercicios?.imagen_url && (
                  <img
                    src={ejercicio.ejercicios.imagen_url}
                    alt={ejercicio.ejercicios.nombre}
                    className="ejercicio-foto"
                  />
                )}
                <div className="ejercicio-header">
                  <span>{ejercicio.ejercicios?.nombre}</span>
                  {ejercicio.ejercicios?.video_url ? (
                    <a
                      className="ejercicio-video-link"
                      href={ejercicio.ejercicios.video_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver cómo se hace ▶
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="ejercicio-video-link"
                      onClick={() =>
                        window.alert('Tu profe todavía no cargó un video para este ejercicio.')
                      }
                    >
                      Ver cómo se hace ▶
                    </button>
                  )}
                </div>

                <p className="ejercicio-objetivo">
                  Objetivo: {ejercicio.series} × {ejercicio.reps_objetivo}
                  {ejercicio.kg_objetivo ? ` · ${ejercicio.kg_objetivo} kg` : ''}
                  {ejercicio.rpe ? ` · RPE ${ejercicio.rpe}` : ''}
                </p>

                {esUltimoDelBloque && (
                  <div className="descanso-opciones">
                    <span className="descanso-opciones-label">
                      {esGrupo ? 'Descanso al terminar el bloque:' : 'Descanso:'}
                    </span>
                    {opcionesDescanso.map((segundos) => (
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
                )}

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
                      const anterior = anteriorPorEjercicio[ejercicio.ejercicio_id]?.[serieIndex]
                      return (
                        <tr key={serieIndex} className={claseFila}>
                          <td>{serieIndex + 1}</td>
                          <td className="ejercicio-tabla-anterior">
                            {anterior ? `${anterior.kg}kg × ${anterior.reps}` : '—'}
                          </td>
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
                                onClick={() =>
                                  ajustarValor(exIndex, serieIndex, 'reps', -PASO_REPS)
                                }
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
          })
          return esGrupo ? (
            <div key={bloque.items[0].item.id} className="bloque-grupo">
              {cabecera}
              {tarjetas}
            </div>
          ) : (
            <div key={bloque.items[0].item.id}>
              {cabecera}
              {tarjetas}
            </div>
          )
        })
      )}

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
                    esfuerzo === valor ? 'esfuerzo-chip esfuerzo-chip-activo' : 'esfuerzo-chip'
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
            {errorGuardar && <p className="auth-message">{errorGuardar}</p>}
            <button
              type="button"
              className="pill-button"
              onClick={handleFinalizar}
              disabled={guardando}
            >
              {guardando ? 'Guardando…' : 'Finalizar rutina'}
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

function crearSeriesIniciales(ejercicios) {
  return ejercicios.map((ejercicio) =>
    Array.from({ length: ejercicio.series || CANTIDAD_SERIES_POR_DEFECTO }, () => ({
      kg: ejercicio.kg_objetivo || 0,
      reps: Number.parseInt(ejercicio.reps_objetivo, 10) || 0,
      hecha: false,
    })),
  )
}

function formatearTiempo(segundos) {
  const mm = String(Math.floor(segundos / 60)).padStart(2, '0')
  const ss = String(segundos % 60).padStart(2, '0')
  return `${mm}:${ss}`
}
