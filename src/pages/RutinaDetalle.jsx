import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'
import Cronometro from '../components/entrenar/Cronometro.jsx'
import PantallaCalentamiento from '../components/entrenar/PantallaCalentamiento.jsx'
import PantallaEjercicio from '../components/entrenar/PantallaEjercicio.jsx'
import PantallaDescanso from '../components/entrenar/PantallaDescanso.jsx'
import PantallaFinal from '../components/entrenar/PantallaFinal.jsx'
import VistaGeneral from '../components/entrenar/VistaGeneral.jsx'
import { cargarRutinaCompleta } from '../services/rutinas.js'
import { obtenerUsuarioActual, usuarioGuardado } from '../services/sesion.js'
import {
  cargarHistorial,
  cargarRutinaParaEntrenar,
  historialGuardado,
  rutinaGuardada,
} from '../services/datosCliente.js'
import { guardarEntrenamiento, nuevaFilaDeEntrenamiento } from '../services/colaEntrenamientos.js'
import { agruparEnBloques } from '../utils/bloques.js'
import { obtenerMetodo } from '../data/metodos.js'
import { obtenerFechaHoyISO } from '../utils/dias.js'
import {
  construirTurnos,
  crearSeriesIniciales,
  descansoDespuesDe,
  estadoDeEjercicio,
  mejorSerieAnterior,
  turnoPendiente,
} from '../utils/entrenamiento.js'
import { borrarEnCurso, guardarEnCurso, leerEnCurso } from '../utils/entrenamientoEnCurso.js'
import { formatearNumero } from '../utils/progreso.js'
import { semanaDelCiclo, sugerenciaParaHoy } from '../utils/ciclos.js'
import Esqueleto from '../components/Esqueleto.jsx'

const DURACION_AVISO_MS = 3000
const VIBRACION_FIN_DESCANSO = [300, 150, 300]

// "Modo entrenar": la rutina del cliente de a un ejercicio por vez.
//
//   1. Calentamiento (si el profe lo cargó).
//   2. Un ejercicio por pantalla, con la serie que toca bien grande. Al
//      marcarla arranca solo el descanso (pantalla completa, con vibración
//      al terminar) y después pasa al ejercicio que sigue. En una
//      superserie o circuito alterna los ejercicios y recién descansa al
//      terminar la vuelta (ver construirTurnos en utils/entrenamiento.js).
//   3. Final: vuelta a la calma, "¿Cómo te sentiste?" y guardar.
//
// Lo que va haciendo se guarda en el celular: si toca "Pausar" o se le
// cierra la app, al volver sigue donde estaba (el mismo día).
// Al guardar, queda una sesión en la tabla "sesiones" con el kg/reps de
// cada serie (de ahí salen "La vez pasada", los récords y las gráficas).
//
// Se abre al instante con la copia guardada en el celular y se actualiza
// con lo del servidor (si el alumno todavía no empezó a entrenar).
// Funciona sin señal: la rutina sale de la copia guardada en el celular
// y, si al guardar no hay conexión, el entrenamiento queda en el celular
// y se envía solo cuando vuelve la señal (services/colaEntrenamientos.js).
//
// modoPrevia: el profe ve la rutina como la verá el alumno (desde su
// editor). No guarda nada. tipo = 'rutina' o 'plantilla'.
export default function RutinaDetalle({ modoPrevia = false, tipo = 'rutina' }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [parametros] = useSearchParams()
  const hoy = obtenerFechaHoyISO()

  const [cargando, setCargando] = useState(true)
  const [usuarioId, setUsuarioId] = useState(null)
  const [rutina, setRutina] = useState(null)
  const [ejercicios, setEjercicios] = useState([])
  const [anteriorPorEjercicio, setAnteriorPorEjercicio] = useState({})
  const [mejoresPorEjercicio, setMejoresPorEjercicio] = useState({})
  const [sugerencias, setSugerencias] = useState([])

  const [series, setSeries] = useState([])
  const [calentamientoHecho, setCalentamientoHecho] = useState(false)
  const [inicio, setInicio] = useState(() => Date.now())
  const [visible, setVisible] = useState(0)
  const [records, setRecords] = useState(0)
  const [descanso, setDescanso] = useState(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const [aviso, setAviso] = useState(null)
  const [vistaGeneral, setVistaGeneral] = useState(parametros.get('vista') === 'completa')

  const [fase, setFase] = useState('entrenando')
  const [esfuerzo, setEsfuerzo] = useState(null)
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [pendienteDeEnvio, setPendienteDeEnvio] = useState(false)

  useEffect(() => {
    cargar()
  }, [id])

  // La pantalla no se apaga sola mientras entrena (si el navegador lo
  // permite; si no, no pasa nada).
  useEffect(() => {
    let bloqueo = null
    let cancelado = false
    async function pedirBloqueo() {
      if (!('wakeLock' in navigator)) return
      try {
        const nuevo = await navigator.wakeLock.request('screen')
        if (cancelado) nuevo.release()
        else bloqueo = nuevo
      } catch {
        // Algunos navegadores lo rechazan (por ejemplo con batería baja).
      }
    }
    function alVolver() {
      if (document.visibilityState === 'visible') pedirBloqueo()
    }
    pedirBloqueo()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      cancelado = true
      document.removeEventListener('visibilitychange', alVolver)
      bloqueo?.release()
    }
  }, [])

  // Reloj del descanso: se calcula contra la hora de fin, así no se
  // atrasa si el celular bloquea la pantalla un rato.
  useEffect(() => {
    if (!descanso) return undefined
    const intervalo = setInterval(() => setAhora(Date.now()), 250)
    return () => clearInterval(intervalo)
  }, [descanso])

  const restante = descanso ? Math.max(0, Math.ceil((descanso.fin - ahora) / 1000)) : 0
  useEffect(() => {
    if (descanso && restante === 0) {
      navigator.vibrate?.(VIBRACION_FIN_DESCANSO)
      setDescanso(null)
    }
  }, [descanso, restante])

  // Guarda en el celular lo que lleva hecho (solo si ya empezó).
  useEffect(() => {
    if (cargando || modoPrevia || fase !== 'entrenando') return
    const empezo = series.some((filas) => filas.some((serie) => serie.hecha))
    if (!empezo) return
    guardarEnCurso(id, { fecha: hoy, series, calentamientoHecho, inicio, visible, records })
  }, [series, calentamientoHecho, visible, records, cargando, fase])

  // Para que una carga vieja (de otra rutina) no pise a la nueva.
  const cargaActual = useRef(0)
  // Cómo quedó la pantalla recién armada. Si el alumno ya tocó algo (o
  // se retomó un entrenamiento pausado) vale null.
  const estadoInicial = useRef(null)
  const estadoActual = useRef(null)
  estadoActual.current = { series, calentamientoHecho, visible, fase }

  // Primero muestra al instante la rutina guardada en el celular; después
  // la actualiza con lo del servidor, pero solo si cambió algo y el
  // alumno todavía no empezó (nunca se le cambia la pantalla mientras
  // entrena).
  async function cargar() {
    const numero = ++cargaActual.current
    const vigente = () => numero === cargaActual.current

    if (modoPrevia) {
      setCargando(true)
      const resultado = await cargarRutinaCompleta(tipo, id)
      if (!vigente()) return
      armarPantalla(resultado.datos, resultado.ejercicios, [])
      return
    }

    let huellaMostrada = null
    const usuarioLocal = usuarioGuardado()
    const rutinaLocal = usuarioLocal ? rutinaGuardada(usuarioLocal.id, id) : null
    const historialLocal = usuarioLocal ? historialGuardado(usuarioLocal.id) : null
    if (rutinaLocal && historialLocal) {
      setUsuarioId(usuarioLocal.id)
      huellaMostrada = huella(rutinaLocal, historialLocal.sesiones)
      armarPantalla(rutinaLocal.rutina, rutinaLocal.ejercicios, historialLocal.sesiones)
    } else {
      setCargando(true)
    }

    const usuario = await obtenerUsuarioActual()
    if (!vigente()) return
    if (!usuario) {
      navigate('/')
      return
    }
    setUsuarioId(usuario.id)
    const [datosRutina, historial] = await Promise.all([
      cargarRutinaParaEntrenar(usuario.id, id),
      cargarHistorial(usuario.id),
    ])
    if (!vigente()) return
    if (huellaMostrada !== null) {
      if (huella(datosRutina, historial.sesiones) === huellaMostrada) return
      if (alumnoYaEmpezo()) return
    }
    armarPantalla(datosRutina.rutina, datosRutina.ejercicios, historial.sesiones)
  }

  function alumnoYaEmpezo() {
    const inicial = estadoInicial.current
    const actual = estadoActual.current
    return (
      !inicial ||
      actual.series !== inicial.series ||
      actual.calentamientoHecho !== inicial.calentamientoHecho ||
      actual.visible !== inicial.visible ||
      actual.fase !== inicial.fase
    )
  }

  // Arma la pantalla con la rutina, sus ejercicios y el historial de
  // entrenamientos (del más viejo al más nuevo).
  function armarPantalla(datos, lista, historialSesiones) {
    let mejores = {}
    let anteriores = {}

    if (!modoPrevia) {
      // Del más nuevo al más viejo.
      const sesiones = [...historialSesiones].reverse()

      // "La vez pasada": la última vez que hizo ESTA rutina.
      const ultima = sesiones.find((sesion) => sesion.rutina_id === id)
      const anterior = {}
      for (const item of ultima?.detalle || []) anterior[item.ejercicio_id] = item.series || []
      setAnteriorPorEjercicio(anterior)
      anteriores = anterior

      // Mejor marca histórica de cada ejercicio (en cualquier rutina),
      // para avisar si hoy hace un récord.
      mejores = {}
      for (const sesion of sesiones) {
        for (const item of sesion.detalle || []) {
          for (const fila of item.series || []) {
            if (fila.hecha === false) continue
            const actual = mejores[item.ejercicio_id] || { kg: 0, reps: 0 }
            mejores[item.ejercicio_id] = {
              kg: Math.max(actual.kg, Number(fila.kg) || 0),
              reps: Math.max(actual.reps, Number(fila.reps) || 0),
            }
          }
        }
      }
    }

    setRutina(datos || null)
    setEjercicios(lista)

    // Peso sugerido para hoy en cada ejercicio (ciclo o progresión).
    const sugeridas = lista.map((ejercicio) =>
      sugerenciaParaHoy(ejercicio, datos, anteriores[ejercicio.ejercicio_id], hoy),
    )
    setSugerencias(sugeridas)
    const iniciales = crearSeriesIniciales(lista, sugeridas)
    const enCurso = modoPrevia ? null : leerEnCurso(id, hoy)
    if (enCurso && mismaForma(enCurso.series, iniciales)) {
      setSeries(enCurso.series)
      setCalentamientoHecho(Boolean(enCurso.calentamientoHecho))
      setInicio(enCurso.inicio || Date.now())
      setVisible(Math.min(enCurso.visible || 0, Math.max(0, lista.length - 1)))
      setRecords(enCurso.records || 0)
      // Retomó un entrenamiento pausado: cuenta como "ya empezó".
      estadoInicial.current = null
      // Lo que ya hizo hoy también cuenta como marca, así no se festeja
      // dos veces el mismo récord al volver de una pausa.
      lista.forEach((ejercicio, indice) => {
        for (const serie of enCurso.series[indice]) {
          if (!serie.hecha) continue
          const actual = mejores[ejercicio.ejercicio_id] || { kg: 0, reps: 0 }
          mejores[ejercicio.ejercicio_id] = {
            kg: Math.max(actual.kg, Number(serie.kg) || 0),
            reps: Math.max(actual.reps, Number(serie.reps) || 0),
          }
        }
      })
    } else {
      const calentamiento = !datos?.calentamiento?.length
      setSeries(iniciales)
      setCalentamientoHecho(calentamiento)
      setInicio(Date.now())
      setVisible(0)
      estadoInicial.current = {
        series: iniciales,
        calentamientoHecho: calentamiento,
        visible: 0,
        fase: 'entrenando',
      }
    }
    setMejoresPorEjercicio(mejores)
    setCargando(false)
  }

  const bloques = useMemo(() => agruparEnBloques(ejercicios), [ejercicios])
  const turnos = useMemo(() => construirTurnos(ejercicios), [ejercicios])

  function mostrarAvisoTemporal(texto, tipoAviso) {
    setAviso({ texto, tipo: tipoAviso })
    setTimeout(
      () => setAviso((actual) => (actual?.texto === texto ? null : actual)),
      DURACION_AVISO_MS,
    )
  }

  function ajustarValor(exIndex, serieIndex, campo, delta) {
    setSeries((actual) =>
      actual.map((filas, i) =>
        i !== exIndex
          ? filas
          : filas.map((fila, j) =>
              j !== serieIndex
                ? fila
                : { ...fila, [campo]: Math.max(0, Number(fila[campo]) + delta) },
            ),
      ),
    )
  }

  function marcarSerie(exIndex, serieIndex) {
    const hecha = !series[exIndex][serieIndex].hecha
    const nuevas = series.map((filas, i) =>
      i !== exIndex
        ? filas
        : filas.map((fila, j) => (j !== serieIndex ? fila : { ...fila, hecha })),
    )
    setSeries(nuevas)
    if (!hecha) return

    revisarRecord(exIndex, serieIndex)

    const turno = turnos.find((item) => item.exIndex === exIndex && item.serieIndex === serieIndex)
    const siguiente = turnoPendiente(turnos, nuevas)
    if (!siguiente) {
      setDescanso(null)
      setFase('final')
      return
    }

    // Superserie o circuito: sin descanso, se pasa al próximo de la vuelta.
    if (turno && !turno.finDeRonda) {
      const proximo = turnos[turnos.indexOf(turno) + 1]
      const destino =
        proximo && !nuevas[proximo.exIndex][proximo.serieIndex].hecha ? proximo : siguiente
      setVisible(destino.exIndex)
      mostrarAvisoTemporal(
        `Sin descanso: seguí con ${ejercicios[destino.exIndex].ejercicios?.nombre || 'el próximo'}`,
        'bloque',
      )
      return
    }

    const { opciones, segundos } = descansoDespuesDe(
      turno || { exIndex, finDeBloque: false },
      ejercicios,
      rutina,
    )
    setVisible(siguiente.exIndex)
    setAhora(Date.now())
    setDescanso({
      fin: Date.now() + segundos * 1000,
      total: segundos,
      opciones,
      titulo: turno?.finDeBloque ? 'Cambio de ejercicio' : 'Descansá',
      loQueSigue: textoDelTurno(siguiente),
    })
  }

  function textoDelTurno(turno) {
    const ejercicio = ejercicios[turno.exIndex]
    const serie = series[turno.exIndex]?.[turno.serieIndex]
    const total = series[turno.exIndex]?.length || ejercicio.series
    return {
      titulo: `${ejercicio.ejercicios?.nombre || 'Ejercicio'} · Serie ${turno.serieIndex + 1} de ${total}`,
      detalle: `${formatearNumero(Number(serie?.kg))} kg × ${ejercicio.reps_objetivo || serie?.reps} reps`,
    }
  }

  // Compara la serie recién marcada contra su mejor marca histórica.
  function revisarRecord(exIndex, serieIndex) {
    if (modoPrevia) return
    const ejercicio = ejercicios[exIndex]
    const ejercicioId = ejercicio?.ejercicio_id
    if (!ejercicioId) return
    const fila = series[exIndex][serieIndex]
    const kg = Number(fila.kg) || 0
    const reps = Number(fila.reps) || 0
    const mejor = mejoresPorEjercicio[ejercicioId]
    setMejoresPorEjercicio((actual) => ({
      ...actual,
      [ejercicioId]: { kg: Math.max(mejor?.kg || 0, kg), reps: Math.max(mejor?.reps || 0, reps) },
    }))
    // El primer intento de un ejercicio no cuenta como récord.
    if (!mejor) return
    const nombre = ejercicio.ejercicios?.nombre || 'este ejercicio'
    let texto = null
    if (kg > mejor.kg && kg > 0) {
      texto = `🏆 ¡Récord de peso en ${nombre}! ${formatearNumero(kg)} kg`
    } else if (reps > mejor.reps && reps > 0) {
      texto = `🏆 ¡Récord de repeticiones en ${nombre}! ${reps} reps`
    }
    if (texto) {
      setRecords((cantidad) => cantidad + 1)
      mostrarAvisoTemporal(texto, 'record')
    }
  }

  function salir() {
    if (modoPrevia) navigate(-1)
    else navigate('/inicio')
  }

  async function finalizar() {
    if (!usuarioId || modoPrevia) return
    setGuardando(true)
    const detalle = ejercicios.map((ejercicio, exIndex) => ({
      ejercicio_id: ejercicio.ejercicio_id,
      nombre: ejercicio.ejercicios?.nombre || '',
      metodo: ejercicio.metodo || 'normal',
      series: series[exIndex].map((fila) => ({ kg: fila.kg, reps: fila.reps, hecha: fila.hecha })),
    }))
    const resultado = await guardarEntrenamiento(
      nuevaFilaDeEntrenamiento({
        cliente_id: usuarioId,
        rutina_id: rutina.id,
        fecha: hoy,
        esfuerzo,
        comentario: comentario.trim() || null,
        detalle,
      }),
    )
    // Enviado o guardado en el celular: en los dos casos ya no se pierde.
    setGuardando(false)
    setPendienteDeEnvio(resultado === 'en-cola')
    borrarEnCurso(id)
    setFase('guardado')
  }

  // --- Pantallas ---

  if (cargando) {
    return (
      <div className="screen">
        <TopPattern />
        <Esqueleto tipo="pantalla" filas={4} />
      </div>
    )
  }

  if (!rutina) {
    return (
      <div className="screen entrenar">
        <div className="entrenar-pantalla entrenar-pantalla-centrada">
          <p className="entrenar-objetivo">
            No encontramos esa rutina. Si tu plan está vencido, al pagar la vas a volver a ver.
          </p>
          <Link to="/rutinas" className="boton-principal">
            Volver a mis rutinas
          </Link>
          {!modoPrevia && (
            <Link to="/suscripcion" className="boton-secundario">
              Ver mi suscripción
            </Link>
          )}
        </div>
      </div>
    )
  }

  const avisoPrevia = modoPrevia && (
    <div className="entrenar-previa">
      <span>Vista previa · así lo ve el alumno</span>
      <button type="button" className="boton-texto" onClick={salir}>
        Salir
      </button>
    </div>
  )

  if (ejercicios.length === 0) {
    return (
      <div className="screen entrenar">
        {avisoPrevia}
        <div className="entrenar-pantalla entrenar-pantalla-centrada">
          <h1 className="entrenar-titulo">{rutina.nombre}</h1>
          <p className="entrenar-objetivo">
            Tu profe todavía no le cargó ejercicios a esta rutina.
          </p>
          {!modoPrevia && (
            <Link to="/rutinas" className="boton-principal">
              Volver a mis rutinas
            </Link>
          )}
        </div>
      </div>
    )
  }

  const totalSeries = series.reduce((total, filas) => total + filas.length, 0)
  const seriesHechas = series.reduce(
    (total, filas) => total + filas.filter((serie) => serie.hecha).length,
    0,
  )

  if (fase !== 'entrenando') {
    return (
      <div className="screen entrenar">
        {avisoPrevia}
        <PantallaFinal
          vueltaCalma={rutina.vuelta_calma}
          resumen={{
            series: seriesHechas,
            total: totalSeries,
            segundos: (Date.now() - inicio) / 1000,
            records,
          }}
          esfuerzo={esfuerzo}
          comentario={comentario}
          onEsfuerzo={setEsfuerzo}
          onComentario={setComentario}
          onFinalizar={finalizar}
          onVolver={() => setFase('entrenando')}
          guardando={guardando}
          guardado={fase === 'guardado'}
          pendienteDeEnvio={pendienteDeEnvio}
          modoPrevia={modoPrevia}
        />
      </div>
    )
  }

  const ejercicio = ejercicios[visible]
  const ciclo = semanaDelCiclo(rutina, hoy)
  const bloque = bloques.find((item) => item.items.some(({ indice }) => indice === visible))
  const posicionEnBloque = bloque.items.findIndex(({ indice }) => indice === visible)
  const siguienteEjercicio = ejercicios[visible + 1]
  const empezado = seriesHechas > 0

  return (
    <div className="screen entrenar">
      {avisoPrevia}
      {aviso && !descanso && (
        <div
          className={aviso.tipo === 'record' ? 'record-banner' : 'record-banner bloque-banner'}
          role="status"
        >
          {aviso.texto}
        </div>
      )}

      <header className="entrenar-barra">
        <button type="button" className="boton-secundario boton-chico" onClick={salir}>
          {modoPrevia ? 'Salir' : 'Pausar'}
        </button>
        <span className="entrenar-barra-titulo">
          {calentamientoHecho
            ? `Ejercicio ${visible + 1} de ${ejercicios.length}`
            : 'Calentamiento'}
          {ciclo && <small className="entrenar-ciclo">Semana {ciclo.semana} de {ciclo.total}</small>}
        </span>
        <span className="entrenar-barra-derecha">
          <Cronometro desde={inicio} />
          <button
            type="button"
            className="entrenar-ver-todo"
            onClick={() => setVistaGeneral(true)}
            aria-label="Ver toda la rutina"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
            </svg>
          </button>
        </span>
      </header>

      <div className="entrenar-avance" aria-hidden="true">
        {series.map((filas, indice) => {
          const estado = estadoDeEjercicio(filas)
          let clase = 'entrenar-avance-tramo'
          if (estado.completo) clase += ' hecho'
          else if (estado.hechas) clase += ' parcial'
          if (indice === visible && calentamientoHecho) clase += ' actual'
          return <span key={indice} className={clase} />
        })}
      </div>

      {!calentamientoHecho ? (
        <PantallaCalentamiento
          actividades={rutina.calentamiento}
          onListo={() => {
            setCalentamientoHecho(true)
            if (!empezado) setInicio(Date.now())
          }}
        />
      ) : (
        <>
          <PantallaEjercicio
            key={visible}
            ejercicio={ejercicio}
            bloque={{
              metodo: bloque.metodo,
              cantidad: bloque.items.length,
              posicion: posicionEnBloque + 1,
              instruccion: obtenerMetodo(bloque.metodo).instruccion(bloque.config || {}),
            }}
            series={series[visible]}
            anterior={mejorSerieAnterior(anteriorPorEjercicio[ejercicio.ejercicio_id])}
            sugerencia={sugerencias[visible]}
            onAjustar={(serieIndex, campo, delta) =>
              ajustarValor(visible, serieIndex, campo, delta)
            }
            onMarcar={(serieIndex) => marcarSerie(visible, serieIndex)}
          />

          <footer className="entrenar-pie">
            <button
              type="button"
              className="entrenar-flecha"
              onClick={() => setVisible(visible - 1)}
              disabled={visible === 0}
              aria-label="Ejercicio anterior"
            >
              ‹
            </button>
            <div className="entrenar-pie-texto">
              <small>{siguienteEjercicio ? 'Sigue' : 'Es el último'}</small>
              <strong>
                {siguienteEjercicio
                  ? siguienteEjercicio.ejercicios?.nombre || 'Ejercicio'
                  : 'Después, terminar'}
              </strong>
            </div>
            {siguienteEjercicio ? (
              <button
                type="button"
                className="entrenar-flecha"
                onClick={() => setVisible(visible + 1)}
                aria-label="Ejercicio siguiente"
              >
                ›
              </button>
            ) : (
              <button
                type="button"
                className="boton-principal boton-chico"
                onClick={() => setFase('final')}
              >
                Terminar
              </button>
            )}
          </footer>
        </>
      )}

      {vistaGeneral && (
        <VistaGeneral
          rutina={rutina}
          bloques={bloques}
          series={series}
          empezado={empezado}
          onElegir={(indice) => {
            setVisible(indice)
            setCalentamientoHecho(true)
            setVistaGeneral(false)
          }}
          onCerrar={() => setVistaGeneral(false)}
          onTerminar={() => {
            setVistaGeneral(false)
            setFase('final')
          }}
        />
      )}

      {descanso && (
        <PantallaDescanso
          restante={restante}
          total={descanso.total}
          opciones={descanso.opciones}
          titulo={descanso.titulo}
          loQueSigue={descanso.loQueSigue}
          aviso={aviso?.tipo === 'record' ? aviso.texto : null}
          onElegir={(segundos) =>
            setDescanso((actual) => ({
              ...actual,
              total: segundos,
              fin: Date.now() + segundos * 1000,
            }))
          }
          onSumar={(segundos) =>
            setDescanso((actual) => ({
              ...actual,
              total: actual.total + segundos,
              fin: actual.fin + segundos * 1000,
            }))
          }
          onListo={() => setDescanso(null)}
        />
      )}
    </div>
  )
}

// Resumen de lo que se muestra (rutina, ejercicios y entrenamientos),
// para saber si lo que llegó del servidor es distinto a lo guardado.
function huella({ rutina, ejercicios }, sesiones) {
  return JSON.stringify([rutina, ejercicios, sesiones.map((sesion) => sesion.id)])
}

// true si el progreso guardado corresponde a esta misma rutina (mismos
// ejercicios y series); si el profe la cambió, se arranca de cero.
function mismaForma(guardadas, iniciales) {
  return (
    Array.isArray(guardadas) &&
    guardadas.length === iniciales.length &&
    guardadas.every((filas, i) => filas?.length === iniciales[i].length)
  )
}
