import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'
import WeekDots from '../components/WeekDots.jsx'
import BottomNav from '../components/BottomNav.jsx'
import Bienvenida from '../components/Bienvenida.jsx'
import ConsentimientoPendiente from '../components/ConsentimientoPendiente.jsx'
import InvitacionNotificaciones from '../components/InvitacionNotificaciones.jsx'
import { obtenerUsuarioActual, usuarioGuardado } from '../services/sesion.js'
import {
  cargarHistorial,
  cargarInicioCliente,
  historialGuardado,
  inicioGuardado,
  precargarRutinasSinConexion,
} from '../services/datosCliente.js'
import { precargarPantallas } from '../pantallasDiferidas.js'
import { estadoDelPlan, textoVence } from '../data/vencimiento.js'
import { necesitaAceptarTerminos } from '../data/versionLegal.js'
import { tocaMedirse } from '../utils/medidas.js'
import { semanaDelCiclo } from '../utils/ciclos.js'
import { obtenerPlan } from '../data/planes.js'
import {
  DIAS_SEMANA,
  obtenerNombreDiaHoy,
  obtenerFechaDeDiaEstaSemana,
  obtenerFechaHoyISO,
  calcularRachaSemanas,
  proximoDiaConRutina,
  textoFechaCorta,
  textoFechaLarga,
} from '../utils/dias.js'
import { estimarMinutos } from '../utils/entrenamiento.js'
import { leerEnCurso } from '../utils/entrenamientoEnCurso.js'
import { marcarBienvenidaVista, yaVioBienvenida } from '../utils/bienvenida.js'
import { formatearNumero, ultimoRecord } from '../utils/progreso.js'
import Esqueleto from '../components/Esqueleto.jsx'

// Inicio e historial guardados en el celular del usuario de la sesión
// guardada (o null si falta alguno: entonces se espera al servidor).
function leerGuardado() {
  const usuario = usuarioGuardado()
  if (!usuario) return null
  const inicio = inicioGuardado(usuario.id)
  const historial = historialGuardado(usuario.id)
  if (!inicio || !historial) return null
  return { usuarioId: usuario.id, inicio, historial }
}

// Inicio del cliente: una sola acción clara. Arriba el saludo y la
// semana en puntos; en el medio, "Hoy te toca" con el botón verde grande
// para empezar (o seguir) el entrenamiento; abajo la racha y el último
// récord. La primera vez que entra se muestra la bienvenida.
//
// El calendario (qué rutina toca cada día) lo arma el profe. Los días
// cumplidos salen de la tabla "sesiones" (más los entrenamientos que
// quedaron guardados en el celular esperando señal).
//
// Se abre al instante con lo último guardado en el celular y se
// actualiza apenas contesta el servidor. Funciona sin señal: muestra lo
// último que se cargó (ver services/datosCliente.js) y, con señal, deja guardadas en el celular
// todas las rutinas para poder entrenar sin conexión.
//
// También avisa cuándo vence el plan y, si ya pasaron los días de
// gracia, reemplaza el entrenamiento por el botón para pagar (ver
// data/vencimiento.js).
export default function Home() {
  const navigate = useNavigate()
  const [parametros, setParametros] = useSearchParams()
  // Lo último guardado en el celular se muestra al instante (sin
  // "Cargando…") y se actualiza apenas contesta el servidor.
  const [guardado] = useState(() => leerGuardado())
  const [cargando, setCargando] = useState(!guardado)
  const [usuarioId, setUsuarioId] = useState(guardado?.usuarioId || null)
  const [datos, setDatos] = useState(guardado?.inicio || null)
  const [sesiones, setSesiones] = useState(guardado?.historial.sesiones || [])
  const [sinConexion, setSinConexion] = useState(false)
  const [mostrarBienvenida, setMostrarBienvenida] = useState(
    () => Boolean(guardado) && debeVerBienvenida(guardado.usuarioId),
  )

  useEffect(() => {
    cargarDatos()
  }, [])

  function debeVerBienvenida(id) {
    return parametros.get('bienvenida') === '1' || !yaVioBienvenida(id)
  }

  async function cargarDatos() {
    const usuario = await obtenerUsuarioActual()
    if (!usuario) {
      navigate('/')
      return
    }
    setUsuarioId(usuario.id)

    const [inicio, historial] = await Promise.all([
      cargarInicioCliente(usuario.id),
      cargarHistorial(usuario.id),
    ])

    setDatos(inicio)
    setSesiones(historial.sesiones)
    setSinConexion(inicio.sinConexion)
    // Si ya se mostró lo guardado, la bienvenida ya se decidió (y no se
    // vuelve a abrir si la cerró mientras se actualizaba).
    if (!guardado) setMostrarBienvenida(debeVerBienvenida(usuario.id))
    setCargando(false)

    if (!inicio.sinConexion && inicio.acceso?.acceso !== false) {
      precargarRutinasSinConexion(usuario.id)
    }
    // Deja descargadas las pantallas que se abren desde acá (Medidas…).
    precargarPantallas('cliente')
  }

  function cerrarBienvenida() {
    marcarBienvenidaVista(usuarioId)
    setMostrarBienvenida(false)
    if (parametros.get('bienvenida')) setParametros({}, { replace: true })
  }

  if (cargando) {
    return (
      <div className="screen has-bottom-nav">
        <TopPattern />
        <Esqueleto tipo="inicio" />
        <BottomNav />
      </div>
    )
  }

  if (mostrarBienvenida) return <Bienvenida onTerminar={cerrarBienvenida} />

  const perfil = datos?.perfil || null
  if (!sinConexion && necesitaAceptarTerminos(perfil)) {
    return <ConsentimientoPendiente onAceptado={cargarDatos} />
  }

  const calendario = datos?.calendario || {}
  const hoy = obtenerFechaHoyISO()
  const diaHoy = obtenerNombreDiaHoy()
  const rutinaHoy = calendario[diaHoy]?.rutinas || null
  const ejerciciosHoy = rutinaHoy ? datos?.ejerciciosPorRutina?.[rutinaHoy.id] || [] : []
  const cantidadRutinas = datos?.cantidadRutinas || 0
  const cuentaPendiente = perfil?.estado === 'pendiente'
  const plan = estadoDelPlan(perfil, hoy)
  // La base de datos es la que decide si puede ver sus rutinas; si no
  // respondió (sin señal), se usa la misma regla calculada acá.
  const planBloqueado =
    !cuentaPendiente &&
    (datos?.acceso ? datos.acceso.acceso === false : plan.tipo === 'vencido')
  const enCurso = rutinaHoy ? leerEnCurso(rutinaHoy.id, hoy) : null

  const fechasConSesion = new Set(sesiones.map((sesion) => sesion.fecha))
  const dias = DIAS_SEMANA.map((dia) => {
    if (!calendario[dia]?.rutina_id) return { dia, cumplido: null }
    return { dia, cumplido: fechasConSesion.has(obtenerFechaDeDiaEstaSemana(dia)) }
  })
  const diasConEntrenamiento = dias.filter((item) => item.cumplido !== null).length
  const diasCumplidos = dias.filter((item) => item.cumplido === true).length
  const entrenoHoy = fechasConSesion.has(hoy)
  const racha = calcularRachaSemanas(sesiones.map((sesion) => sesion.fecha))
  const record = ultimoRecord(sesiones)
  const proximo = proximoDiaConRutina(calendario, diaHoy)

  return (
    <div className="screen has-bottom-nav inicio">
      <TopPattern />

      <header className="inicio-saludo">
        <div>
          <p className="inicio-fecha">{textoFechaLarga()}</p>
          <h1 className="inicio-hola">Hola, {perfil?.nombre || 'crack'}</h1>
          <p className="inicio-plan">{obtenerPlan(perfil?.plan)?.nombre || 'Sin plan'}</p>
        </div>
        <Link to="/perfil" className="inicio-avatar" aria-label="Mi perfil">
          {iniciales(perfil)}
        </Link>
      </header>

      {cuentaPendiente && (
        <Link to="/suscripcion" className="home-aviso-pendiente">
          {perfil?.aviso_pago
            ? 'Avisaste tu pago. Tu profe lo está revisando.'
            : 'Tu cuenta está pendiente. Tocá acá para ver cómo pagar y activarla.'}
        </Link>
      )}

      {!cuentaPendiente && !planBloqueado && plan.tipo === 'por-vencer' && (
        <Link to="/suscripcion" className="home-aviso-pendiente">
          Tu plan {textoVence(plan.dias)}. Tocá acá para renovarlo.
        </Link>
      )}

      {!planBloqueado && plan.tipo === 'gracia' && (
        <Link to="/suscripcion" className="home-aviso-pendiente home-aviso-urgente">
          Tu plan venció el {textoFechaCorta(perfil.vencimiento)}.{' '}
          {plan.dias === 0
            ? 'Hoy es el último día para pagar sin perder el acceso.'
            : `Tenés ${plan.dias} ${plan.dias === 1 ? 'día' : 'días'} para pagar sin perder el acceso.`}{' '}
          Tocá acá para pagar.
        </Link>
      )}

      {datos?.avanceNuevo && (
        <Link to="/progreso#avance" className="home-aviso-pendiente home-aviso-avance">
          📈 Tu profe publicó tu resumen de avance. Tocá acá para verlo.
        </Link>
      )}

      {diasConEntrenamiento > 0 && (
        <section className="inicio-semana">
          <p className="seccion-etiqueta">
            Esta semana · {diasCumplidos} de {diasConEntrenamiento}
          </p>
          <WeekDots dias={dias} diaHoy={diaHoy} />
        </section>
      )}

      <section className="inicio-hoy">
        {cuentaPendiente ? (
          <TarjetaMensaje
            titulo="Cuenta pendiente"
            texto="En cuanto se confirme tu pago vas a ver acá tu entrenamiento del día."
            accion={{ texto: 'Ver cómo pagar', to: '/suscripcion' }}
          />
        ) : planBloqueado ? (
          <TarjetaMensaje
            titulo="Tu plan está vencido"
            texto={`Venció el ${textoFechaCorta(perfil?.vencimiento)}. Pagá la cuota para volver a ver tus rutinas. Tu historial y tus récords siguen guardados.`}
            accion={{ texto: 'Pagar y reactivar', to: '/suscripcion' }}
          />
        ) : rutinaHoy ? (
          <div className="hoy-tarjeta">
            <span className="hoy-etiqueta">{entrenoHoy ? 'Ya entrenaste hoy' : 'Hoy te toca'}</span>
            <h2 className="hoy-nombre">{rutinaHoy.nombre}</h2>
            <div className="chips-lista">
              {ejerciciosHoy.length > 0 && (
                <span className="chip chip-dato">
                  {ejerciciosHoy.length} {ejerciciosHoy.length === 1 ? 'ejercicio' : 'ejercicios'}
                </span>
              )}
              {ejerciciosHoy.length > 0 && (
                <span className="chip chip-dato">
                  ~{estimarMinutos(rutinaHoy, ejerciciosHoy)} min
                </span>
              )}
              {rutinaHoy.calentamiento?.length > 0 && (
                <span className="chip chip-dato">Con calentamiento</span>
              )}
              {semanaDelCiclo(rutinaHoy, hoy) && !semanaDelCiclo(rutinaHoy, hoy).terminado && (
                <span className="chip chip-dato">
                  Semana {semanaDelCiclo(rutinaHoy, hoy).semana} de{' '}
                  {semanaDelCiclo(rutinaHoy, hoy).total}
                </span>
              )}
            </div>
            <Link to={`/rutinas/${rutinaHoy.id}`} className="boton-principal boton-grande">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              {enCurso
                ? 'Seguir entrenamiento'
                : entrenoHoy
                  ? 'Entrenar de nuevo'
                  : 'Empezar entrenamiento'}
            </Link>
            <Link to={`/rutinas/${rutinaHoy.id}?vista=completa`} className="boton-texto">
              Ver la rutina antes de empezar
            </Link>
          </div>
        ) : cantidadRutinas === 0 ? (
          <TarjetaMensaje
            titulo="Tu profe está armando tu rutina"
            texto="Te va a aparecer acá apenas esté lista. Mientras tanto, completá tus datos para que te conozca mejor."
            accion={{ texto: 'Completar mis datos', to: '/mis-datos' }}
          />
        ) : diasConEntrenamiento === 0 ? (
          <TarjetaMensaje
            titulo="Elegí qué entrenar hoy"
            texto="Tu profe todavía no te asignó días. Entrá a tus rutinas y elegí una."
            accion={{ texto: 'Ver mis rutinas', to: '/rutinas' }}
          />
        ) : (
          <TarjetaMensaje
            titulo="Hoy es día de descanso"
            texto={
              proximo
                ? `Recuperá bien. Próximo entrenamiento: ${proximo.dia}${
                    proximo.fila.rutinas?.nombre ? ` · ${proximo.fila.rutinas.nombre}` : ''
                  }.`
                : 'Aprovechá para recuperar. Mañana seguimos.'
            }
            accion={{ texto: 'Quiero entrenar igual', to: '/rutinas', secundaria: true }}
          />
        )}
      </section>

      {sesiones.length > 0 && !cuentaPendiente && <InvitacionNotificaciones usuarioId={usuarioId} />}

      {datos?.ultimaMedicion !== undefined &&
        !planBloqueado &&
        !cuentaPendiente &&
        sesiones.length >= 3 &&
        tocaMedirse(datos.ultimaMedicion, hoy) && (
          <Link to="/medidas" className="home-aviso-pendiente home-aviso-medidas">
            📏{' '}
            {datos.ultimaMedicion
              ? 'Pasaron 4 semanas desde tus últimas medidas. Tocá acá para cargar las de hoy.'
              : 'Cargá tus medidas y fotos de hoy: así vas a ver cuánto cambiás.'}
          </Link>
        )}

      {sesiones.length > 0 && (
        <section className="inicio-datos">
          <div className="dato-tarjeta">
            <span className="dato-etiqueta">Racha</span>
            <strong className="dato-valor">
              {racha} {racha === 1 ? 'semana' : 'semanas'}
            </strong>
          </div>
          <Link to="/progreso" className="dato-tarjeta">
            <span className="dato-etiqueta">{record ? 'Último récord' : 'Entrenamientos'}</span>
            <strong className="dato-valor">
              {record ? `${record.nombre} ${formatearNumero(record.kg)} kg` : sesiones.length}
            </strong>
          </Link>
        </section>
      )}

      <BottomNav />
    </div>
  )
}

function TarjetaMensaje({ titulo, texto, accion }) {
  return (
    <div className="hoy-tarjeta hoy-tarjeta-mensaje">
      <h2 className="hoy-mensaje-titulo">{titulo}</h2>
      <p className="hoy-mensaje-texto">{texto}</p>
      {accion && (
        <Link to={accion.to} className={accion.secundaria ? 'boton-secundario' : 'boton-principal'}>
          {accion.texto}
        </Link>
      )}
    </div>
  )
}

function iniciales(perfil) {
  const letras = `${perfil?.nombre?.[0] || ''}${perfil?.apellido?.[0] || ''}`.toUpperCase()
  return letras || '·'
}
