import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { generarResumenesPendientes } from '../services/progreso.js'
import { obtenerUsuarioActual } from '../services/sesion.js'
import { recordado, recordar } from '../services/memoriaSesion.js'
import { traerTodasLasFilas } from '../services/paginado.js'
import { cargarActividadClientes } from '../services/actividad.js'
import { armarTareas, primerosPasos } from '../utils/tareasProfe.js'
import { semanaDelCiclo } from '../utils/ciclos.js'
import { obtenerFechaHoyISO, textoFechaLarga } from '../utils/dias.js'
import InterruptorNotificaciones from '../components/InterruptorNotificaciones.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { SOLO_CLIENTES } from '../utils/roles.js'

// Lo último que se mostró queda en memoria (services/memoriaSesion.js):
// al volver a Inicio se ve al instante y se actualiza por detrás.
const MEMORIA_PANEL = 'panel-profe'

// Inicio del profe: una lista de tareas "Para hacer hoy", ordenada por
// urgencia (pagos, clientes sin rutina, rutinas sin guardar, clientes que
// no entrenan, resúmenes para aprobar...). Cada tarea tiene su botón para
// resolverla en un toque. Si el profe recién empieza, arriba aparecen los
// primeros pasos. La lógica de qué tareas mostrar está en
// utils/tareasProfe.js. Al volver a Inicio se muestra al instante lo
// último cargado (MEMORIA_PANEL) y se actualiza por detrás.
//
// La cuenta Admin (utils/roles.js) usa este mismo Inicio: ve las tareas de
// todos los clientes, se identifica con la etiqueta "Admin" y no ve los
// "Primeros pasos" (son para un profe que recién empieza).
export default function PanelProfe() {
  const navigate = useNavigate()
  const guardado = recordado(MEMORIA_PANEL)
  const [cargando, setCargando] = useState(!guardado)
  const [nombre, setNombre] = useState(guardado?.nombre || '')
  const [tareas, setTareas] = useState(guardado?.tareas || [])
  const [pasos, setPasos] = useState(guardado?.pasos || null)
  const [armaEquipo, setArmaEquipo] = useState(guardado?.armaEquipo || false)
  const [esAdmin, setEsAdmin] = useState(guardado?.esAdmin || false)

  useEffect(() => {
    let activo = true
    cargar(() => activo)
    // Los resúmenes de 4 semanas se arman por detrás (no frenan la
    // pantalla). Si se creó alguno, se actualiza la lista de tareas.
    generarResumenesPendientes()
      .then((nuevos) => {
        if (nuevos > 0 && activo) cargar(() => activo)
      })
      .catch(() => {})
    return () => {
      activo = false
    }
  }, [])

  // "sigueAbierta": si el profe ya se fue de la pantalla, no se toca nada.
  async function cargar(sigueAbierta) {
    const usuario = await obtenerUsuarioActual()
    // Todo junto, en un solo viaje al servidor.
    const [
      { data: yo },
      { data: clientes },
      { data: rutinas },
      { data: calendario },
      actividad,
      { data: resumenes },
      { count: ejercicios },
      { data: rol },
      { data: mediciones, error: errorMediciones },
    ] = await Promise.all([
      supabase.from('perfiles').select('nombre').eq('id', usuario?.id).single(),
      traerTodasLasFilas(() =>
        supabase.from('perfiles').select('*').match(SOLO_CLIENTES).order('id'),
      ),
      traerTodasLasFilas(() => supabase.from('rutinas').select('*').order('id')),
      traerTodasLasFilas(() =>
        supabase.from('calendario_cliente').select('id, cliente_id, rutina_id').order('id'),
      ),
      // Cuándo entrenó cada cliente por última vez (una fila por cliente).
      cargarActividadClientes(),
      supabase.from('resumenes_progreso').select('id, cliente_id').eq('estado', 'borrador'),
      supabase.from('ejercicios').select('*', { count: 'exact', head: true }),
      // ¿Es administrador o dueño de gimnasio? (para "Equipo y gimnasios")
      supabase.rpc('mi_rol'),
      // Clientes con medidas (si la tabla todavía no existe, se ignora).
      supabase.from('mediciones').select('cliente_id'),
    ])
    if (!sigueAbierta()) return

    const hoy = obtenerFechaHoyISO()
    const ciclosTerminados = (rutinas || [])
      .filter((rutina) => rutina.publicada !== false && semanaDelCiclo(rutina, hoy)?.terminado)
      .map((rutina) => ({
        rutina,
        cliente: (clientes || []).find((cliente) => cliente.id === rutina.cliente_id),
      }))
      .filter((item) => item.cliente?.estado === 'activo')

    const ultimaSesion = {}
    for (const [clienteId, registro] of actividad) ultimaSesion[clienteId] = registro.ultima

    const soyAdmin = Boolean(rol?.es_admin)
    const panel = {
      nombre: yo?.nombre || '',
      esAdmin: soyAdmin,
      armaEquipo: soyAdmin || Boolean(rol?.gimnasios?.length),
      tareas: armarTareas({
        clientes: clientes || [],
        rutinas: rutinas || [],
        calendario: calendario || [],
        ultimaSesion,
        resumenesBorrador: resumenes || [],
        conMediciones: errorMediciones
          ? null
          : new Set((mediciones || []).map((fila) => fila.cliente_id)),
        ciclosTerminados,
        hoy,
      }),
      pasos: soyAdmin
        ? null
        : primerosPasos({
            ejercicios: ejercicios || 0,
            clientesActivos: (clientes || []).filter((cliente) => cliente.estado === 'activo')
              .length,
            rutinas: (rutinas || []).length,
          }),
    }
    recordar(MEMORIA_PANEL, panel)
    setNombre(panel.nombre)
    setArmaEquipo(panel.armaEquipo)
    setEsAdmin(panel.esAdmin)
    setTareas(panel.tareas)
    setPasos(panel.pasos)
    setCargando(false)
  }

  async function cerrarSesion() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <ProfeLayout>
      <header className="inicio-saludo inicio-saludo-profe">
        <div>
          <p className="inicio-fecha">{textoFechaLarga()}</p>
          {esAdmin && <span className="estado-chip estado-ok etiqueta-admin">Admin</span>}
          <h1 className="inicio-hola">
            {saludo()}
            {nombre ? `, ${nombre}` : ''}
          </h1>
          {!cargando && (
            <p className="inicio-plan">
              {tareas.length === 0
                ? 'Todo al día. No hay nada pendiente.'
                : `Tenés ${tareas.length} ${tareas.length === 1 ? 'cosa' : 'cosas'} para resolver.`}
            </p>
          )}
        </div>
      </header>

      {cargando ? (
        <Esqueleto />
      ) : (
        <>
          {pasos && (
            <section className="primeros-pasos">
              <p className="seccion-etiqueta">Primeros pasos</p>
              {pasos.map((paso, indice) => (
                <Link
                  key={paso.texto}
                  to={paso.to}
                  className={paso.hecho ? 'paso-item paso-item-hecho' : 'paso-item'}
                >
                  <span className="paso-numero">{paso.hecho ? '✓' : indice + 1}</span>
                  <span>{paso.texto}</span>
                </Link>
              ))}
            </section>
          )}

          <section className="tareas">
            <p className="seccion-etiqueta">Para hacer hoy</p>
            {tareas.length === 0 ? (
              <div className="tarea tarea-ok">
                <span className="tarea-icono tarea-icono-ok" aria-hidden="true">
                  ✓
                </span>
                <span className="tarea-textos">
                  <strong>¡Todo al día!</strong>
                  <small>Tus clientes tienen rutina, días y pagos en orden.</small>
                </span>
              </div>
            ) : (
              tareas.map((tarea) => <Tarea key={tarea.id} tarea={tarea} />)
            )}
          </section>

          <section className="accesos">
            <p className="seccion-etiqueta">Accesos rápidos</p>
            <div className="accesos-grilla">
              <Link to="/profe/rutinas" className="acceso acceso-principal">
                + Nueva rutina
              </Link>
              <Link to="/profe/ejercicios" className="acceso">
                + Nuevo ejercicio
              </Link>
              <Link to="/profe/calendario" className="acceso">
                La semana de todos
              </Link>
              <Link to="/profe/progresion" className="acceso">
                Progresión
              </Link>
              <Link to="/profe/estadisticas" className="acceso">
                Estadísticas
              </Link>
              {armaEquipo && (
                <Link to="/profe/equipo" className={esAdmin ? 'acceso acceso-principal' : 'acceso'}>
                  Equipo y gimnasios
                </Link>
              )}
            </div>
          </section>

          <div className="lista-tarjetas">
            <InterruptorNotificaciones textoActivar="Te avisamos en este celular cuando alguien se registra, avisa que pagó o paga con Mercado Pago." />
          </div>

          <button type="button" className="boton-texto perfil-salir" onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </>
      )}
    </ProfeLayout>
  )
}

function Tarea({ tarea }) {
  const urgente = tarea.nivel === 'urgente'
  const claseBoton = urgente ? 'boton-principal boton-chico' : 'boton-secundario boton-chico'
  return (
    <div className={urgente ? 'tarea tarea-urgente' : 'tarea'}>
      <span
        className={`tarea-icono tarea-icono-${urgente ? 'urgente' : 'aviso'}`}
        aria-hidden="true"
      >
        <IconoTarea tipo={tarea.icono} />
      </span>
      <span className="tarea-textos">
        {urgente && <span className="tarea-nivel">Urgente</span>}
        <strong>{tarea.titulo}</strong>
        {tarea.detalle && <small>{tarea.detalle}</small>}
      </span>
      {tarea.accion.href ? (
        <a href={tarea.accion.href} className={claseBoton} target="_blank" rel="noreferrer">
          {tarea.accion.texto}
        </a>
      ) : (
        <Link to={tarea.accion.to} className={claseBoton}>
          {tarea.accion.texto}
        </Link>
      )}
    </div>
  )
}

function IconoTarea({ tipo }) {
  const trazos = {
    pago: <path d="M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2zM2 10h20" />,
    rutina: <path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" />,
    reloj: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2" />,
    grafico: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
    calendario: <path d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" />,
    baja: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
    medida: <path d="M3 17l14-14 4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2" />,
  }
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {trazos[tipo] || trazos.rutina}
    </svg>
  )
}

function saludo() {
  const hora = new Date().getHours()
  if (hora < 12) return 'Buen día'
  if (hora < 20) return 'Buenas tardes'
  return 'Buenas noches'
}
