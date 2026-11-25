import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'
import BarraEntrenar from '../components/entrenar/BarraEntrenar.jsx'
import PantallaCalentamiento from '../components/entrenar/PantallaCalentamiento.jsx'
import PantallaEjercicio from '../components/entrenar/PantallaEjercicio.jsx'
import PantallaDescanso from '../components/entrenar/PantallaDescanso.jsx'
import PantallaFinal from '../components/entrenar/PantallaFinal.jsx'
import PantallaPausa from '../components/entrenar/PantallaPausa.jsx'
import PieEntrenar from '../components/entrenar/PieEntrenar.jsx'
import VistaGeneral from '../components/entrenar/VistaGeneral.jsx'
import { useAvisoDeDescanso } from '../components/entrenar/useAvisoDeDescanso.js'
import {
  avisoDeDescansoPrendido,
  guardarAvisoDeDescanso,
  guardarSonidoDeDescanso,
  sonidoDeDescansoPrendido,
} from '../services/avisosAlumno.js'
import { bip, prepararSonido } from '../utils/sonido.js'
import { cargarRutinaCompleta } from '../services/rutinas.js'
import { obtenerUsuarioActual, usuarioGuardado } from '../services/sesion.js'
import {
  cargarHistorial,
  cargarRutinaParaEntrenar,
  historialGuardado,
  rutinaGuardada,
} from '../services/datosCliente.js'
import {
  EN_COLA,
  NO_GUARDADO,
  guardarEntrenamiento,
  nuevaFilaDeEntrenamiento,
} from '../services/colaEntrenamientos.js'
import { agruparEnBloques } from '../utils/bloques.js'
import { obtenerMetodo } from '../data/metodos.js'
import { obtenerFechaHoyISO } from '../utils/dias.js'
import {
  alternarFallo,
  cambiarValorDeSerie,
  construirTurnos,
  contarSeries,
  descansoDespuesDe,
  etiquetaDeSerie,
  mejorSerieAnterior,
  turnoSiguiente,
  vuelveAPendiente,
} from '../utils/entrenamiento.js'
import { TIPO_CALENTAMIENTO, esSerieDeCalentamiento } from '../utils/seriesCalentamiento.js'
import {
  actividadCorriendo,
  completarActividad,
  elegirActividad,
  empezarActividad,
  pausarActividad,
  resumenDeCalentamiento,
  sumarTiempo,
} from '../utils/calentamiento.js'
import {
  borrarEnCurso,
  guardarEnCurso,
  leerEnCurso,
  pausarEnCurso,
  reanudarEnCurso,
} from '../utils/entrenamientoEnCurso.js'
import { relojCorriendo, relojEnMarcha, relojParado, segundosDeReloj } from '../utils/reloj.js'
import {
  cambiarDuracion,
  empezarDescanso,
  segundosRestantes,
  sumarAlDescanso,
} from '../utils/descanso.js'
import { formatearNumero, formatearPeso } from '../utils/progreso.js'
import { esPorTiempo, pasoDeSegundos, textoDeSerie } from '../utils/porTiempo.js'
import { esRecordDeTiempo, recordDeSerie, sumarSerieAMarca } from '../utils/records.js'
import { semanaDelCiclo } from '../utils/ciclos.js'
import {
  huella,
  prepararEntrenamiento,
  textoDeRecord,
  tituloDelDescanso,
  yaEmpezo,
} from '../utils/pantallaEntrenar.js'
import Esqueleto from '../components/Esqueleto.jsx'
import { useConfirmar } from '../components/ConfirmarAccion.jsx'
import { RUTA_INGRESAR } from '../data/rutas.js'

const DURACION_AVISO_MS = 3000
// Vibración al terminar un descanso o el tiempo de una actividad del
// calentamiento.
const VIBRACION_FIN_TIEMPO = [300, 150, 300]

// "Modo entrenar": la rutina del cliente de a un ejercicio por vez.
//
//   1. Calentamiento (si el profe lo cargó): es una parte más del
//      entrenamiento, no un trámite. Cada actividad tiene su reloj grande
//      (como el descanso) y se marca con ✓ como una serie; ocupa el primer
//      tramo de la barra de avance y el tiempo del entrenamiento arranca
//      con él. Ver components/entrenar/PantallaCalentamiento.jsx y
//      utils/calentamiento.js.
//   2. Un ejercicio por pantalla, con la serie que toca bien grande. Al
//      marcarla arranca solo el descanso (pantalla completa, con vibración
//      al terminar) y después pasa al ejercicio que sigue. En una
//      superserie o circuito alterna los ejercicios y recién descansa al
//      terminar la vuelta (ver construirTurnos en utils/entrenamiento.js).
//      Si el ejercicio tiene series de calentamiento (aproximación), van
//      primero, en amarillo, y se hacen igual que las efectivas pero con
//      su propio descanso (utils/seriesCalentamiento.js). Se guardan en el
//      entrenamiento aparte ("calentamiento"), así no cuentan para los
//      récords ni las gráficas.
//   3. Final: cómo le fue en el calentamiento, vuelta a la calma,
//      "¿Cómo te sentiste?" y guardar.
//
// Mirar sin entrenar: desde "Mis rutinas" (o "Ver la rutina antes de
// empezar") la rutina se abre entera, solo para mirarla (?vista=completa).
// Nada arranca hasta tocar "Empezar entrenamiento"; con "Volver" se sale
// sin que quede nada anotado.
//
// Cancelar: si arrancó sin querer, "Cancelar entrenamiento" (en la
// pausa y en el final) descarta lo que lleva hecho: no se guarda nada.
//
// Ejercicios por tiempo (plancha): las repeticiones son segundos y cada
// serie tiene su cronómetro (utils/porTiempo.js,
// components/entrenar/CronometroDeSerie.jsx).
//
// Récords (utils/records.js): de peso y de tonelaje de la serie (kg ×
// reps) en cada ejercicio, y de tiempo si completa toda la rutina más
// rápido que nunca. Para eso se guarda cuánto duró ("duracion_seg").
//
// Tiempo del entrenamiento (arriba a la derecha): arranca cuando empieza
// (el calentamiento o, si no tiene, al abrir la rutina) y se frena en la
// pausa y en el final. "Pausar" abre la pantalla "En pausa"
// (PantallaPausa.jsx): seguir, salir al inicio o terminar. Salir de la
// pantalla de cualquier forma (por ejemplo con "atrás") también la deja en
// pausa, y al volver a abrirla sigue sola desde donde quedó.
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
  const [confirmar, hojaConfirmar] = useConfirmar()
  const [parametros] = useSearchParams()
  const hoy = obtenerFechaHoyISO()

  const [cargando, setCargando] = useState(true)
  const [usuarioId, setUsuarioId] = useState(null)
  const [rutina, setRutina] = useState(null)
  const [ejercicios, setEjercicios] = useState([])
  const [anteriorPorEjercicio, setAnteriorPorEjercicio] = useState({})
  // Mejor marca de cada ejercicio (utils/records.js) y el menor tiempo
  // en que completó esta rutina (null si nunca), para avisar los récords.
  const [mejoresPorEjercicio, setMejoresPorEjercicio] = useState({})
  const [mejorTiempo, setMejorTiempo] = useState(null)
  const [sugerencias, setSugerencias] = useState([])

  const [series, setSeries] = useState([])
  // Estado del calentamiento (utils/calentamiento.js), null si la rutina
  // no tiene; enCalentamiento: se está viendo la pantalla del calentamiento.
  const [calentamiento, setCalentamiento] = useState(null)
  const [enCalentamiento, setEnCalentamiento] = useState(false)
  // Tiempo del entrenamiento (utils/reloj.js) y pausa: null mientras
  // entrena; { desde, calentamientoCorria } en pausa (ver
  // utils/entrenamientoEnCurso.js).
  const [reloj, setReloj] = useState(() => relojParado())
  const [pausa, setPausa] = useState(null)
  const [visible, setVisible] = useState(0)
  const [records, setRecords] = useState(0)
  // En qué ejercicios rompió un récord hoy (para festejarlo al final).
  const [ejerciciosConRecord, setEjerciciosConRecord] = useState([])
  const [descanso, setDescanso] = useState(null)
  // "Avisarme al terminar" el descanso (se recuerda en el celular).
  const [avisoDescanso, setAvisoDescanso] = useState(() => avisoDeDescansoPrendido())
  const [sonidoDescanso, setSonidoDescanso] = useState(() => sonidoDeDescansoPrendido())
  const [ahora, setAhora] = useState(() => Date.now())
  const [aviso, setAviso] = useState(null)
  const [vistaGeneral, setVistaGeneral] = useState(parametros.get('vista') === 'completa')
  // Entró solo a mirar la rutina (desde "Mis rutinas"): hasta que toca
  // "Empezar entrenamiento" no arranca nada.
  const [soloMirando, setSoloMirando] = useState(parametros.get('vista') === 'completa')
  // Tocó "Cancelar entrenamiento": al salir ya no se guarda nada.
  const cancelado = useRef(false)

  const [fase, setFase] = useState('entrenando')
  const [esfuerzo, setEsfuerzo] = useState(null)
  const [comentario, setComentario] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [pendienteDeEnvio, setPendienteDeEnvio] = useState(false)
  // No se pudo guardar (ni enviar ni anotar en el celular): se avisa en
  // el final y el botón queda para reintentar.
  const [errorAlGuardar, setErrorAlGuardar] = useState(false)
  // El entrenamiento recién guardado (para ofrecer corregirlo).
  const [sesionGuardadaId, setSesionGuardadaId] = useState(null)

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

  // Reloj del descanso (utils/descanso.js): se calcula contra la hora de
  // fin, así no se atrasa si el celular bloquea la pantalla un rato.
  useEffect(() => {
    if (!descanso) return undefined
    const intervalo = setInterval(() => setAhora(Date.now()), 250)
    return () => clearInterval(intervalo)
  }, [descanso])

  const restante = segundosRestantes(descanso, ahora)

  // Notificación al terminar el descanso si sale de DREY (no en la vista
  // previa del profe). Ver components/entrenar/useAvisoDeDescanso.js.
  useAvisoDeDescanso(descanso, avisoDescanso && !modoPrevia)

  function cambiarAvisoDescanso(prendido) {
    setAvisoDescanso(prendido)
    guardarAvisoDeDescanso(prendido)
  }
  function cambiarSonidoDescanso(prendido) {
    if (prendido) prepararSonido()
    setSonidoDescanso(prendido)
    guardarSonidoDeDescanso(prendido)
  }

  // Últimos 3 segundos: un bip corto por segundo; al terminar, uno largo
  // y la vibración (si DREY está a la vista; si no, llega la notificación).
  useEffect(() => {
    if (!descanso) return
    const suena = sonidoDescanso && !modoPrevia && document.visibilityState === 'visible'
    if (restante === 0) {
      navigator.vibrate?.(VIBRACION_FIN_TIEMPO)
      if (suena) bip(1320, 0.5)
      setDescanso(null)
    } else if (restante <= 3 && suena) {
      bip(880, 0.12)
    }
  }, [descanso, restante])

  // Guarda en el celular lo que lleva hecho (solo si ya empezó: una
  // serie marcada o el calentamiento arrancado). También en el final,
  // hasta que toca "Guardar entrenamiento".
  const sePuedeRetomar =
    !cargando && !modoPrevia && fase !== 'guardado' && yaEmpezo(series, calentamiento)
  useEffect(() => {
    if (sePuedeRetomar && !cancelado.current) guardarEnCurso(id, datosEnCurso())
  }, [
    series,
    calentamiento,
    enCalentamiento,
    reloj,
    pausa,
    visible,
    records,
    ejerciciosConRecord,
    sePuedeRetomar,
  ])

  function datosEnCurso(cambios = {}) {
    return {
      fecha: hoy,
      nombre: rutina?.nombre || '',
      series,
      calentamiento,
      enCalentamiento,
      reloj,
      pausa,
      // En el final, al volver a abrirla se muestra el final para guardar.
      fase: fase === 'final' ? 'final' : 'entrenando',
      visible,
      records,
      ejerciciosConRecord,
      ...cambios,
    }
  }

  // Si sale de la pantalla sin tocar "Pausar" (por ejemplo con el botón
  // "atrás" del celular), el entrenamiento queda en pausa: el tiempo que
  // pasa afuera no cuenta. (Bloquear el celular no pausa: sigue
  // entrenando.)
  const alSalir = useRef(null)
  alSalir.current = sePuedeRetomar && !cancelado.current ? datosEnCurso() : null
  useEffect(
    () => () => {
      const datos = alSalir.current
      if (datos && !datos.pausa) guardarEnCurso(id, pausarEnCurso(datos, Date.now()))
    },
    [id],
  )

  // Para que una carga vieja (de otra rutina) no pise a la nueva.
  const cargaActual = useRef(0)
  // Cómo quedó la pantalla recién armada. Si el alumno ya tocó algo (o
  // se retomó un entrenamiento pausado) vale null.
  const estadoInicial = useRef(null)
  const estadoActual = useRef(null)
  estadoActual.current = { series, calentamiento, enCalentamiento, reloj, pausa, visible, fase }

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
      navigate(RUTA_INGRESAR)
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
      actual.calentamiento !== inicial.calentamiento ||
      actual.enCalentamiento !== inicial.enCalentamiento ||
      actual.reloj !== inicial.reloj ||
      actual.pausa !== inicial.pausa ||
      actual.visible !== inicial.visible ||
      actual.fase !== inicial.fase
    )
  }

  // Arma la pantalla con lo cargado (ver prepararEntrenamiento en
  // utils/pantallaEntrenar.js: retoma un entrenamiento a medias si hay).
  function armarPantalla(datos, ejerciciosGuardados, historialSesiones) {
    const inicio = prepararEntrenamiento({
      datos,
      ejerciciosGuardados,
      historialSesiones,
      rutinaId: id,
      hoy,
      ahora: Date.now(),
      modoPrevia,
      enCurso: modoPrevia ? null : leerEnCurso(id, hoy),
      vistaCompleta: parametros.get('vista') === 'completa',
    })
    if (!modoPrevia) {
      setAnteriorPorEjercicio(inicio.anteriores)
      setMejorTiempo(inicio.mejorTiempo)
    }
    setRutina(inicio.rutina)
    setEjercicios(inicio.ejercicios)
    setSugerencias(inicio.sugerencias)
    setSeries(inicio.series)
    setCalentamiento(inicio.calentamiento)
    setEnCalentamiento(inicio.enCalentamiento)
    setReloj(inicio.reloj)
    setPausa(inicio.pausa)
    setVisible(inicio.visible)
    if (inicio.retomado) {
      setFase(inicio.fase)
      setRecords(inicio.records)
      setEjerciciosConRecord(inicio.ejerciciosConRecord)
      // Ya está entrenando: no es "solo mirar".
      setSoloMirando(false)
    }
    estadoInicial.current = inicio.estadoInicial
    setMejoresPorEjercicio(inicio.mejores)
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

  // Peso o repeticiones de una serie: con + / − (delta) o escritos a mano
  // (valor). Ver cambiarValorDeSerie en utils/entrenamiento.js.
  // nuevoValor: un número, o una función que lo calcula con el valor que
  // tiene la serie en ese momento (para los + / − tocados rápido).
  function fijarValor(exIndex, serieIndex, campo, nuevoValor) {
    setSeries((actual) =>
      actual.map((filas, i) => {
        if (i !== exIndex || !filas[serieIndex]) return filas
        const valor =
          typeof nuevoValor === 'function'
            ? nuevoValor(Number(filas[serieIndex][campo]))
            : nuevoValor
        return cambiarValorDeSerie(filas, serieIndex, campo, valor)
      }),
    )
  }

  // En un ejercicio por tiempo, los + / − de los segundos van de a 1 en
  // los tiempos cortos y de a 5 en los largos (utils/porTiempo.js).
  function ajustarValor(exIndex, serieIndex, campo, delta) {
    const enSegundos = campo === 'reps' && esPorTiempo(ejercicios[exIndex])
    fijarValor(exIndex, serieIndex, campo, (valor) =>
      enSegundos ? valor + Math.sign(delta) * pasoDeSegundos(valor, delta) : valor + delta,
    )
  }

  // "Llegué al fallo" de una serie (se prende y se apaga). Ver
  // alternarFallo en utils/entrenamiento.js.
  function cambiarFallo(exIndex, serieIndex) {
    setSeries((actual) =>
      actual.map((filas, i) => (i === exIndex ? alternarFallo(filas, serieIndex) : filas)),
    )
  }

  // Marca (o desmarca) una serie. cambios: valores que se fijan junto con
  // la marca (el cronómetro de una serie por tiempo pasa los segundos que
  // aguantó: { reps }).
  function marcarSerie(exIndex, serieIndex, cambios = null) {
    // El navegador deja sonar solo después de un toque: se prepara acá el
    // bip del final del descanso.
    if (sonidoDescanso) prepararSonido()
    const relojActual = iniciarReloj()
    const hecha = !series[exIndex][serieIndex].hecha
    const nuevas = series.map((filas, i) =>
      i !== exIndex
        ? filas
        : filas.map((fila, j) =>
            j !== serieIndex ? fila : { ...fila, ...(hecha ? cambios : null), hecha },
          ),
    )
    setSeries(nuevas)
    if (!hecha) return

    revisarRecord(exIndex, nuevas[exIndex][serieIndex])

    const turno = turnos.find((item) => item.exIndex === exIndex && item.serieIndex === serieIndex)
    // Si salteó un ejercicio (máquina ocupada) y está haciendo otro, sigue
    // con ese y recién al terminarlo vuelve a lo pendiente (turnoSiguiente).
    const siguiente = turnoSiguiente(turnos, nuevas, turno)
    if (!siguiente) {
      terminar(relojActual)
      return
    }

    // Superserie o circuito: sin descanso, se pasa al próximo de la vuelta
    // (si ese todavía no lo hizo; si ya lo hizo, la vuelta terminó y toca
    // descansar).
    const proximo = turno ? turnos[turnos.indexOf(turno) + 1] : null
    const proximoPendiente = proximo && !nuevas[proximo.exIndex][proximo.serieIndex].hecha
    if (turno && !turno.finDeRonda && proximoPendiente) {
      setVisible(siguiente.exIndex)
      mostrarAvisoTemporal(
        `Sin descanso: seguí con ${ejercicios[siguiente.exIndex].ejercicios?.nombre || 'el próximo'}`,
        'bloque',
      )
      return
    }

    const { opciones, segundos } = descansoDespuesDe(
      turno || { exIndex, finDeBloque: false },
      ejercicios,
      rutina,
    )
    const momento = Date.now()
    setVisible(siguiente.exIndex)
    setAhora(momento)
    setDescanso(
      empezarDescanso(segundos, momento, {
        opciones,
        titulo: tituloDelDescanso(turno),
        calentamiento: turno?.tipo === TIPO_CALENTAMIENTO,
        loQueSigue: {
          ...textoDelTurno(siguiente, nuevas),
          pendiente: vuelveAPendiente(siguiente, turno),
        },
      }),
    )
  }

  // Cambia el descanso que está corriendo (otra duración o "+15 s") sin
  // reiniciarlo: ver utils/descanso.js. Si mientras tanto el descanso
  // terminó, no hay nada que cambiar.
  function cambiarElDescanso(cambio) {
    setAhora(Date.now())
    setDescanso((actual) => (actual ? cambio(actual) : actual))
  }

  // "Sentadilla · Calentamiento 2 de 3" / "Sentadilla · Serie 1 de 4",
  // con el peso y las repeticiones, para "Lo que sigue" en el descanso.
  function textoDelTurno(turno, lista = series) {
    const ejercicio = ejercicios[turno.exIndex]
    const filas = lista[turno.exIndex] || []
    const serie = filas[turno.serieIndex]
    const etiqueta = etiquetaDeSerie(filas, turno.serieIndex)
    const cantidad = etiqueta.calentamiento ? serie?.reps : ejercicio.reps_objetivo || serie?.reps
    const porTiempo = esPorTiempo(ejercicio)
    const kg = Number(serie?.kg) || 0
    return {
      titulo: `${ejercicio.ejercicios?.nombre || 'Ejercicio'} · ${etiqueta.texto} de ${etiqueta.total}`,
      detalle: porTiempo
        ? textoDeSerie(kg ? formatearPeso(kg) : 0, cantidad, true)
        : `${formatearNumero(kg)} kg × ${cantidad} reps`,
      calentamiento: etiqueta.calentamiento,
    }
  }

  // Compara la serie recién marcada contra la mejor marca histórica del
  // ejercicio (las de calentamiento no cuentan). Ver utils/records.js: de
  // peso, de tonelaje de la serie (kg × reps) y, sin peso o por tiempo, de
  // repeticiones o de segundos.
  function revisarRecord(exIndex, fila) {
    if (modoPrevia || esSerieDeCalentamiento(fila)) return
    const ejercicio = ejercicios[exIndex]
    const ejercicioId = ejercicio?.ejercicio_id
    if (!ejercicioId) return
    const mejor = mejoresPorEjercicio[ejercicioId]
    setMejoresPorEjercicio((actual) => ({
      ...actual,
      [ejercicioId]: sumarSerieAMarca(actual[ejercicioId], fila),
    }))
    const record = recordDeSerie(mejor, fila, esPorTiempo(ejercicio))
    if (!record) return
    setRecords((cantidad) => cantidad + 1)
    const nombre = ejercicio.ejercicios?.nombre || 'este ejercicio'
    setEjerciciosConRecord((lista) => (lista.includes(nombre) ? lista : [...lista, nombre]))
    mostrarAvisoTemporal(textoDeRecord(record, fila, nombre), 'record')
  }

  // --- Calentamiento ---

  // El tiempo del entrenamiento arranca con la primera actividad del
  // calentamiento.
  function empezarCalentamiento() {
    iniciarReloj()
    setCalentamiento(empezarActividad(calentamiento, Date.now()))
  }

  function completarCalentamiento() {
    iniciarReloj()
    setCalentamiento(completarActividad(calentamiento))
  }

  // Se cumplió el tiempo de la actividad: vibra y queda hecha, como al
  // terminar un descanso. La siguiente espera a que el alumno toque
  // "Empezar" (tiene que ir a la máquina o al lugar).
  function tiempoCumplido(indice) {
    if (calentamiento?.actual !== indice || !actividadCorriendo(calentamiento)) return
    navigator.vibrate?.(VIBRACION_FIN_TIEMPO)
    setCalentamiento(completarActividad(calentamiento))
  }

  // Pasa a los ejercicios (al terminar o salteando lo que falta). Si una
  // actividad estaba corriendo, su reloj se pausa: al volver sigue igual.
  function irAEjercicios(indice = visible) {
    iniciarReloj()
    setCalentamiento(pausarActividad(calentamiento, Date.now()))
    setEnCalentamiento(false)
    setVisible(indice)
  }

  // Vuelve a la pantalla del calentamiento. Con "indice" (desde "Ver toda
  // la rutina") abre esa actividad si todavía no la hizo.
  function volverAlCalentamiento(indice) {
    if (indice !== undefined && !calentamiento.hechas[indice]) {
      setCalentamiento(elegirActividad(calentamiento, indice))
    }
    setEnCalentamiento(true)
  }

  // --- Tiempo, pausa y final ---

  // Arranca el tiempo la primera vez que hace algo (si todavía no corría).
  // Devuelve el tiempo como queda.
  function iniciarReloj() {
    if (relojCorriendo(reloj) || pausa || yaEmpezo(series, calentamiento)) return reloj
    const nuevo = relojEnMarcha(Date.now())
    setReloj(nuevo)
    return nuevo
  }

  function aplicarPausa(datos) {
    setReloj(datos.reloj)
    setCalentamiento(datos.calentamiento)
    setPausa(datos.pausa)
  }

  // Frena el tiempo y el reloj del calentamiento.
  function pausar() {
    setDescanso(null)
    aplicarPausa(pausarEnCurso({ reloj, calentamiento, pausa }, Date.now()))
  }

  function seguir() {
    aplicarPausa(reanudarEnCurso({ reloj, calentamiento, pausa }, Date.now()))
  }

  // Vuelve a Inicio con el entrenamiento en pausa. Se guarda acá porque
  // la pantalla se cierra antes de que corra el guardado de arriba.
  function salirAlInicio() {
    if (yaEmpezo(series, calentamiento)) {
      guardarEnCurso(id, datosEnCurso(pausarEnCurso({ reloj, calentamiento, pausa }, Date.now())))
    }
    navigate('/inicio')
  }

  // El tiempo se frena en el final (y sigue si vuelve a los ejercicios).
  function irAlFinal() {
    terminar(reloj)
  }

  function terminar(relojActual) {
    setDescanso(null)
    setVistaGeneral(false)
    aplicarPausa(pausarEnCurso({ reloj: relojActual, calentamiento, pausa }, Date.now()))
    setFase('final')
  }

  function volverDelFinal() {
    seguir()
    setFase('entrenando')
  }

  // "Pausar" (arriba a la izquierda). En la vista previa del profe, y
  // mientras el alumno todavía no hizo nada, es "Salir": no hay nada que
  // pausar ni que guardar.
  function tocarPausar() {
    if (modoPrevia || !yaEmpezo(series, calentamiento)) volverAtras()
    else pausar()
  }

  // Vuelve a la pantalla de antes (o a Inicio, si abrió la app directo acá).
  function volverAtras() {
    if (modoPrevia || window.history.length > 1) navigate(-1)
    else navigate('/inicio', { replace: true })
  }

  // "Cancelar entrenamiento": lo empezó sin querer (o no lo va a
  // terminar). Se descarta lo que lleva hecho: no se guarda nada ni queda
  // "en pausa". Pide confirmación porque no se puede deshacer.
  async function cancelarEntrenamiento() {
    const seguro = await confirmar({
      titulo: '¿Cancelar el entrenamiento?',
      texto: 'Se descarta lo que marcaste y no queda guardado.',
      confirmar: 'Sí, descartar',
      cancelar: 'Seguir entrenando',
    })
    if (!seguro) return
    cancelado.current = true
    borrarEnCurso(id)
    navigate('/inicio', { replace: true })
  }

  // "Empezar entrenamiento" después de mirar la rutina: sin calentamiento
  // arranca el tiempo; con calentamiento arranca al tocar su "Empezar".
  function empezarAEntrenar() {
    setSoloMirando(false)
    if (!enCalentamiento) iniciarReloj()
    setVistaGeneral(false)
  }

  async function finalizar() {
    if (modoPrevia || guardando) return
    setGuardando(true)
    setErrorAlGuardar(false)
    // Normalmente ya se sabe quién es; si no, se averigua ahora (sin
    // señal usa la sesión guardada en el celular).
    const clienteId = usuarioId || (await obtenerUsuarioActual())?.id
    if (!clienteId) {
      setGuardando(false)
      setErrorAlGuardar(true)
      return
    }
    // Las series efectivas en "series" (de ahí salen los récords y las
    // gráficas) y las de calentamiento aparte, en "calentamiento".
    const detalle = ejercicios.map((ejercicio, exIndex) => {
      // "fallo" solo se guarda en las series que llegaron al fallo.
      const aGuardar = (fila) => ({
        kg: fila.kg,
        reps: fila.reps,
        hecha: fila.hecha,
        ...(fila.hecha && fila.fallo ? { fallo: true } : {}),
      })
      // "por_tiempo" solo se guarda en los ejercicios por tiempo (sus
      // "reps" son segundos).
      const filas = series[exIndex]
      const calentamiento = filas.filter(esSerieDeCalentamiento).map(aGuardar)
      return {
        ejercicio_id: ejercicio.ejercicio_id,
        nombre: ejercicio.ejercicios?.nombre || '',
        metodo: ejercicio.metodo || 'normal',
        series: filas.filter((fila) => !esSerieDeCalentamiento(fila)).map(aGuardar),
        ...(calentamiento.length ? { calentamiento } : {}),
        ...(esPorTiempo(ejercicio) ? { por_tiempo: true } : {}),
      }
    })
    const fila = nuevaFilaDeEntrenamiento({
      cliente_id: clienteId,
      rutina_id: rutina.id,
      fecha: hoy,
      esfuerzo,
      comentario: comentario.trim() || null,
      // Cuánto duró, sin las pausas (el tiempo ya está frenado en el final).
      duracion_seg: Math.round(segundosDeReloj(reloj, Date.now())),
      detalle,
    })
    const resultado = await guardarEntrenamiento(fila)
    setGuardando(false)
    if (resultado === NO_GUARDADO) {
      // Sigue en el final (y guardado como "en curso"): puede reintentar.
      setErrorAlGuardar(true)
      return
    }
    // Enviado o guardado en el celular: en los dos casos ya no se pierde.
    setPendienteDeEnvio(resultado === EN_COLA)
    setSesionGuardadaId(fila.id)
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
      <button type="button" className="boton-texto" onClick={() => navigate(-1)}>
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

  // Series efectivas (las de calentamiento se cuentan aparte).
  const cuentaSeries = contarSeries(series)
  const totalSeries = cuentaSeries.total
  const seriesHechas = cuentaSeries.hechas

  if (fase !== 'entrenando') {
    // Récord de tiempo: completó todas las series más rápido que nunca
    // (utils/records.js). Cuenta como un récord más.
    const segundosTotales = segundosDeReloj(reloj, Date.now())
    const recordDeTiempo =
      !modoPrevia &&
      esRecordDeTiempo(
        segundosTotales,
        mejorTiempo,
        totalSeries > 0 && seriesHechas === totalSeries,
      )
    return (
      <div className="screen entrenar">
        {avisoPrevia}
        <PantallaFinal
          vueltaCalma={rutina.vuelta_calma}
          resumen={{
            series: seriesHechas,
            total: totalSeries,
            segundos: segundosTotales,
            records: records + (recordDeTiempo ? 1 : 0),
            recordDeTiempo: recordDeTiempo ? { antes: mejorTiempo } : null,
            ejerciciosConRecord,
            calentamiento: resumenDeCalentamiento(calentamiento),
            seriesCalentamiento: {
              hechas: cuentaSeries.calentamientoHechas,
              total: cuentaSeries.calentamientoTotal,
            },
          }}
          esfuerzo={esfuerzo}
          comentario={comentario}
          onEsfuerzo={setEsfuerzo}
          onComentario={setComentario}
          onFinalizar={finalizar}
          onVolver={volverDelFinal}
          onCancelar={cancelarEntrenamiento}
          guardando={guardando}
          guardado={fase === 'guardado'}
          pendienteDeEnvio={pendienteDeEnvio}
          errorAlGuardar={errorAlGuardar}
          corregirEn={sesionGuardadaId ? `/progreso?corregir=${sesionGuardadaId}` : null}
          modoPrevia={modoPrevia}
        />
        {hojaConfirmar}
      </div>
    )
  }

  const ejercicio = ejercicios[visible]
  const ciclo = semanaDelCiclo(rutina, hoy)
  const bloque = bloques.find((item) => item.items.some(({ indice }) => indice === visible))
  const posicionEnBloque = bloque.items.findIndex(({ indice }) => indice === visible)
  const siguienteEjercicio = ejercicios[visible + 1]
  const empezado = yaEmpezo(series, calentamiento)
  const resumenCalentamiento = resumenDeCalentamiento(calentamiento)

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

      <BarraEntrenar
        textoSalir={modoPrevia || !empezado ? 'Salir' : 'Pausar'}
        enCalentamiento={enCalentamiento}
        visible={visible}
        cantidad={ejercicios.length}
        ciclo={ciclo}
        reloj={reloj}
        series={series}
        resumenCalentamiento={resumenCalentamiento}
        onSalir={tocarPausar}
        onVerTodo={() => setVistaGeneral(true)}
      />

      {enCalentamiento ? (
        <>
          <PantallaCalentamiento
            actividades={rutina.calentamiento}
            estado={calentamiento}
            onEmpezar={empezarCalentamiento}
            onPausar={() => setCalentamiento(pausarActividad(calentamiento, Date.now()))}
            onSumar={(segundos) => setCalentamiento(sumarTiempo(calentamiento, segundos))}
            onCompletar={completarCalentamiento}
            onElegir={(indice) => setCalentamiento(elegirActividad(calentamiento, indice))}
            onTiempoCumplido={tiempoCumplido}
            onIrAEjercicios={() => irAEjercicios(visible)}
          />
          <PieEntrenar
            etiqueta="Después"
            texto={ejercicios[visible].ejercicios?.nombre || 'Los ejercicios'}
            onSiguiente={() => irAEjercicios(visible)}
            ayudaSiguiente="Ir a los ejercicios"
          />
        </>
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
            onFijar={(serieIndex, campo, valor) => fijarValor(visible, serieIndex, campo, valor)}
            onMarcar={(serieIndex, cambios) => marcarSerie(visible, serieIndex, cambios)}
            onFallo={(serieIndex) => cambiarFallo(visible, serieIndex)}
          />

          {/* En el primer ejercicio, la flecha de volver lleva al
              calentamiento (si la rutina tiene). */}
          <PieEntrenar
            etiqueta={siguienteEjercicio ? 'Sigue' : 'Es el último'}
            texto={
              siguienteEjercicio
                ? siguienteEjercicio.ejercicios?.nombre || 'Ejercicio'
                : 'Después, terminar'
            }
            onAnterior={
              visible > 0
                ? () => setVisible(visible - 1)
                : calentamiento
                  ? () => volverAlCalentamiento()
                  : null
            }
            ayudaAnterior={visible > 0 ? 'Ejercicio anterior' : 'Volver al calentamiento'}
            onSiguiente={siguienteEjercicio ? () => setVisible(visible + 1) : null}
            ayudaSiguiente="Ejercicio siguiente"
            onTerminar={siguienteEjercicio ? null : irAlFinal}
          />
        </>
      )}

      {vistaGeneral && (
        <VistaGeneral
          rutina={rutina}
          bloques={bloques}
          series={series}
          calentamiento={calentamiento}
          empezado={empezado}
          soloMirar={soloMirando && !empezado && !modoPrevia}
          onEmpezar={empezarAEntrenar}
          onVolver={volverAtras}
          onElegir={(indice) => {
            irAEjercicios(indice)
            setVistaGeneral(false)
          }}
          onElegirCalentamiento={(indice) => {
            volverAlCalentamiento(indice)
            setVistaGeneral(false)
          }}
          onCerrar={() => setVistaGeneral(false)}
          onTerminar={irAlFinal}
        />
      )}

      {descanso && (
        <PantallaDescanso
          restante={restante}
          total={descanso.total}
          opciones={descanso.opciones}
          titulo={descanso.titulo}
          calentamiento={descanso.calentamiento}
          loQueSigue={descanso.loQueSigue}
          aviso={aviso?.tipo === 'record' ? aviso.texto : null}
          onElegir={(segundos) => cambiarElDescanso((actual) => cambiarDuracion(actual, segundos))}
          onSumar={(segundos) => cambiarElDescanso((actual) => sumarAlDescanso(actual, segundos))}
          onListo={() => setDescanso(null)}
          avisoAlTerminar={avisoDescanso}
          onCambiarAviso={modoPrevia ? undefined : cambiarAvisoDescanso}
          sonido={sonidoDescanso}
          onCambiarSonido={modoPrevia ? undefined : cambiarSonidoDescanso}
        />
      )}

      {pausa && !modoPrevia && (
        <PantallaPausa
          nombre={rutina.nombre}
          segundos={segundosDeReloj(reloj, Date.now())}
          seriesHechas={seriesHechas}
          seriesTotales={totalSeries}
          calentamiento={resumenCalentamiento}
          onSeguir={seguir}
          onSalir={salirAlInicio}
          onTerminar={irAlFinal}
          onCancelar={cancelarEntrenamiento}
        />
      )}
      {hojaConfirmar}
    </div>
  )
}
