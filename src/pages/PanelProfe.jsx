import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { generarResumenesPendientes } from '../services/progreso.js'
import { armarTareas, primerosPasos } from '../utils/tareasProfe.js'
import { obtenerFechaHoyISO, textoFechaLarga } from '../utils/dias.js'

// Inicio del profe: una lista de tareas "Para hacer hoy", ordenada por
// urgencia (pagos, clientes sin rutina, rutinas sin guardar, clientes que
// no entrenan, resúmenes para aprobar...). Cada tarea tiene su botón para
// resolverla en un toque. Si el profe recién empieza, arriba aparecen los
// primeros pasos. La lógica de qué tareas mostrar está en
// utils/tareasProfe.js.
export default function PanelProfe() {
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [nombre, setNombre] = useState('')
  const [tareas, setTareas] = useState([])
  const [pasos, setPasos] = useState(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    // Arma solos los resúmenes de 4 semanas que ya correspondan.
    await generarResumenesPendientes()
    const { data: userData } = await supabase.auth.getUser()
    const [
      { data: yo },
      { data: clientes },
      { data: rutinas },
      { data: calendario },
      { data: sesiones },
      { data: resumenes },
      { count: ejercicios },
    ] = await Promise.all([
      supabase.from('perfiles').select('nombre').eq('id', userData?.user?.id).single(),
      supabase
        .from('perfiles')
        .select('id, nombre, apellido, estado, aviso_pago, celular, vencimiento, creado_en')
        .eq('es_profe', false),
      supabase.from('rutinas').select('id, cliente_id, nombre, publicada'),
      supabase.from('calendario_cliente').select('cliente_id, rutina_id'),
      supabase.from('sesiones').select('cliente_id, fecha').order('fecha', { ascending: false }),
      supabase.from('resumenes_progreso').select('id, cliente_id').eq('estado', 'borrador'),
      supabase.from('ejercicios').select('*', { count: 'exact', head: true }),
    ])

    const ultimaSesion = {}
    for (const sesion of sesiones || []) {
      if (!ultimaSesion[sesion.cliente_id]) ultimaSesion[sesion.cliente_id] = sesion.fecha
    }

    setNombre(yo?.nombre || '')
    setTareas(
      armarTareas({
        clientes: clientes || [],
        rutinas: rutinas || [],
        calendario: calendario || [],
        ultimaSesion,
        resumenesBorrador: resumenes || [],
        hoy: obtenerFechaHoyISO(),
      }),
    )
    setPasos(
      primerosPasos({
        ejercicios: ejercicios || 0,
        clientesActivos: (clientes || []).filter((cliente) => cliente.estado === 'activo').length,
        rutinas: (rutinas || []).length,
      }),
    )
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
        <p className="profe-vacio">Cargando…</p>
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
            </div>
          </section>

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
