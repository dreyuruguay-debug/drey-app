import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { copiarEjercicios } from '../services/rutinas.js'
import { obtenerPlan } from '../data/planes.js'
import { DIAS_SEMANA } from '../utils/dias.js'

// Detalle de un cliente: su progreso reciente, sus rutinas ("Ver
// rutinas"), el botón para agregar una nueva y el calendario semanal.
// Cada rutina se arma en su propia pantalla (ProfeRutinaEditor), a la
// que se entra con "Editar" o apenas se crea una rutina nueva.
export default function ProfeClienteDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [cargando, setCargando] = useState(true)
  const [cliente, setCliente] = useState(null)
  const [rutinas, setRutinas] = useState([])
  const [cantidadPorRutina, setCantidadPorRutina] = useState({})
  const [calendario, setCalendario] = useState({})
  const [sesiones, setSesiones] = useState([])
  const [mensaje, setMensaje] = useState('')

  const [nombreNueva, setNombreNueva] = useState('')
  const [patronNueva, setPatronNueva] = useState('')
  const [musculosNueva, setMusculosNueva] = useState('')
  const [creandoRutina, setCreandoRutina] = useState(false)
  const [plantillas, setPlantillas] = useState([])
  const [plantillaElegida, setPlantillaElegida] = useState('')

  useEffect(() => {
    cargarTodo()
  }, [id])

  async function cargarTodo() {
    setCargando(true)

    const [
      { data: perfil },
      { data: listaRutinas },
      { data: listaSesiones },
      { data: listaPlantillas },
    ] = await Promise.all([
      supabase.from('perfiles').select('*').eq('id', id).single(),
      supabase.from('rutinas').select('*').eq('cliente_id', id).order('orden'),
      supabase
        .from('sesiones')
        .select('*, rutinas(nombre)')
        .eq('cliente_id', id)
        .order('fecha', { ascending: false })
        .limit(8),
      supabase.from('plantillas').select('id, nombre, patron, musculos').order('creado_en'),
    ])

    setCliente(perfil || null)
    setRutinas(listaRutinas || [])
    setSesiones(listaSesiones || [])
    setPlantillas(listaPlantillas || [])

    const rutinaIds = (listaRutinas || []).map((rutina) => rutina.id)

    const [{ data: listaRutinaEjercicios }, { data: listaCalendario }] = await Promise.all([
      rutinaIds.length > 0
        ? supabase.from('rutina_ejercicios').select('rutina_id').in('rutina_id', rutinaIds)
        : Promise.resolve({ data: [] }),
      supabase.from('calendario_cliente').select('*, rutinas(nombre)').eq('cliente_id', id),
    ])

    // Cuántos ejercicios tiene cada rutina, para mostrarlo en su tarjeta.
    const cantidades = {}
    for (const item of listaRutinaEjercicios || []) {
      cantidades[item.rutina_id] = (cantidades[item.rutina_id] || 0) + 1
    }
    setCantidadPorRutina(cantidades)

    const diasMap = {}
    for (const fila of listaCalendario || []) {
      diasMap[fila.dia] = fila
    }
    setCalendario(diasMap)

    setCargando(false)
  }

  // --- Rutinas ---

  async function handleCrearRutina(event) {
    event.preventDefault()
    if (!nombreNueva.trim()) return
    setCreandoRutina(true)
    setMensaje('')

    const { data: rutinaCreada, error } = await supabase
      .from('rutinas')
      .insert({
        cliente_id: id,
        nombre: nombreNueva.trim(),
        patron: patronNueva.trim(),
        musculos: musculosNueva.trim(),
        orden: rutinas.length,
      })
      .select()
      .single()

    if (error) {
      setCreandoRutina(false)
      setMensaje('No pudimos crear la rutina. Probá de nuevo.')
      return
    }

    // Si eligió una plantilla, le copia sus ejercicios (con series,
    // métodos y bloques) a la rutina recién creada. De acá en adelante
    // queda como una rutina normal: se puede seguir ajustando sin afectar
    // a la plantilla ni a otros clientes que la usaron.
    if (plantillaElegida) {
      await copiarEjercicios('plantilla', plantillaElegida, 'rutina', rutinaCreada.id)
    }

    setCreandoRutina(false)
    setNombreNueva('')
    setPatronNueva('')
    setMusculosNueva('')
    setPlantillaElegida('')
    navigate(`/profe/clientes/${id}/rutinas/${rutinaCreada.id}`)
  }

  function elegirPlantilla(plantillaId) {
    setPlantillaElegida(plantillaId)
    const plantilla = plantillas.find((item) => item.id === plantillaId)
    if (plantilla) {
      setPatronNueva(plantilla.patron || '')
      setMusculosNueva(plantilla.musculos || '')
      if (!nombreNueva.trim()) setNombreNueva(plantilla.nombre)
    }
  }

  async function handleBorrarRutina(rutina) {
    if (!window.confirm(`¿Borrar "${rutina.nombre}"? No se puede deshacer.`)) return
    const { error } = await supabase.from('rutinas').delete().eq('id', rutina.id)
    if (!error) cargarTodo()
  }

  // Guarda una rutina que ya armaste para este cliente como plantilla
  // reutilizable, así la podés aplicar después a otros clientes desde
  // "Nueva rutina" sin cargar los mismos ejercicios de nuevo.
  async function handleGuardarComoPlantilla(rutina) {
    setMensaje('')
    const { data: plantillaCreada, error } = await supabase
      .from('plantillas')
      .insert({
        nombre: rutina.nombre,
        patron: rutina.patron,
        musculos: rutina.musculos,
        descripcion: rutina.descripcion,
      })
      .select()
      .single()

    if (error) {
      setMensaje('No pudimos guardar la plantilla. Probá de nuevo.')
      return
    }

    await copiarEjercicios('rutina', rutina.id, 'plantilla', plantillaCreada.id)

    setMensaje(`Guardado como plantilla "${rutina.nombre}". Ya la podés usar en otros clientes.`)
    cargarTodo()
  }

  // --- Calendario semanal ---

  async function actualizarDiaCalendario(dia, rutinaId) {
    setCalendario((actual) => ({
      ...actual,
      [dia]: rutinaId ? { ...actual[dia], dia, rutina_id: rutinaId } : { dia, rutina_id: null },
    }))
    await supabase
      .from('calendario_cliente')
      .upsert(
        { cliente_id: id, dia, rutina_id: rutinaId || null },
        { onConflict: 'cliente_id,dia' },
      )
  }

  const nombreCliente = cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Cliente'

  return (
    <ProfeLayout titulo={cargando ? 'Cliente' : nombreCliente} volverA="/profe/clientes">
      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : !cliente ? (
        <p className="profe-vacio">No encontramos ese cliente.</p>
      ) : (
        <>
          <p className="profe-nota">
            {obtenerPlan(cliente.plan)?.nombre || cliente.plan} · {cliente.celular}
          </p>
          {mensaje && <p className="auth-message">{mensaje}</p>}

          <p className="profe-seccion-label">Progreso reciente</p>
          <Link to={`/profe/clientes/${id}/progreso`} className="pill-button progreso-acceso">
            Ver gráficas y resúmenes de progresión →
          </Link>
          {sesiones.length === 0 ? (
            <p className="profe-vacio">Todavía no completó ninguna rutina.</p>
          ) : (
            <div className="profe-progreso-lista">
              {sesiones.map((sesion) => (
                <div key={sesion.id} className="profe-progreso-item">
                  <div className="profe-progreso-item-header">
                    <span className="profe-progreso-fecha">
                      {new Date(`${sesion.fecha}T00:00:00`).toLocaleDateString('es-UY', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <span className="profe-progreso-rutina">
                      {sesion.rutinas?.nombre || 'Rutina borrada'}
                    </span>
                    {sesion.esfuerzo && (
                      <span className="profe-progreso-esfuerzo">Esfuerzo {sesion.esfuerzo}/5</span>
                    )}
                  </div>
                  {sesion.comentario && (
                    <p className="profe-progreso-comentario">"{sesion.comentario}"</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="profe-nota">
            Si el cliente viene levantando fácil, subile el Kg objetivo del ejercicio en la rutina
            (botón Editar).
          </p>

          <p className="profe-seccion-label">Ver rutinas</p>
          {rutinas.length === 0 && (
            <p className="profe-vacio">Este cliente todavía no tiene rutinas armadas.</p>
          )}

          <div className="rutinas-lista-profe">
            {rutinas.map((rutina) => (
              <div key={rutina.id} className="profe-rutina-tarjeta">
                <Link
                  to={`/profe/clientes/${id}/rutinas/${rutina.id}`}
                  className="profe-rutina-tarjeta-info"
                >
                  <p className="profe-cliente-nombre">{rutina.nombre}</p>
                  <p className="profe-cliente-detalle">
                    {[rutina.patron, rutina.musculos].filter(Boolean).join(' · ') || 'Sin patrón'}
                  </p>
                  <p className="profe-cliente-detalle">
                    {cantidadPorRutina[rutina.id] || 0} ejercicios
                  </p>
                </Link>
                <div className="profe-cliente-acciones">
                  <Link
                    to={`/profe/clientes/${id}/rutinas/${rutina.id}`}
                    className="pill-button profe-boton-habilitar"
                  >
                    Editar
                  </Link>
                  <button
                    type="button"
                    className="profe-ejercicio-agregar"
                    onClick={() => handleGuardarComoPlantilla(rutina)}
                    disabled={!cantidadPorRutina[rutina.id]}
                  >
                    Guardar como plantilla
                  </button>
                  <button
                    type="button"
                    className="profe-ejercicio-borrar"
                    onClick={() => handleBorrarRutina(rutina)}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="profe-seccion-label">Agregar rutina</p>
          <form className="profe-form-rutina" onSubmit={handleCrearRutina}>
            {plantillas.length > 0 && (
              <select
                className="profe-calendario-select profe-select-plantilla"
                value={plantillaElegida}
                onChange={(event) => elegirPlantilla(event.target.value)}
              >
                <option value="">Empezar de cero (sin plantilla)</option>
                {plantillas.map((plantilla) => (
                  <option key={plantilla.id} value={plantilla.id}>
                    Usar plantilla: {plantilla.nombre}
                  </option>
                ))}
              </select>
            )}
            <input
              className="auth-input"
              type="text"
              placeholder="Nombre (ej: Rutina A)"
              value={nombreNueva}
              onChange={(event) => setNombreNueva(event.target.value)}
              required
            />
            <input
              className="auth-input"
              type="text"
              placeholder="Patrón (ej: Empuje)"
              value={patronNueva}
              onChange={(event) => setPatronNueva(event.target.value)}
            />
            <input
              className="auth-input"
              type="text"
              placeholder="Músculos (ej: Pecho, hombro, tríceps)"
              value={musculosNueva}
              onChange={(event) => setMusculosNueva(event.target.value)}
            />
            <button type="submit" className="pill-button" disabled={creandoRutina}>
              {creandoRutina ? 'Creando…' : 'Crear y armar la rutina →'}
            </button>
          </form>

          <p className="profe-seccion-label">Calendario semanal</p>
          <p className="profe-nota">
            Elegí qué rutina le toca a este cliente cada día de la semana.
          </p>
          <div className="profe-calendario">
            {DIAS_SEMANA.map((dia) => (
              <div key={dia} className="profe-calendario-dia">
                <span className="profe-calendario-dia-nombre">{dia}</span>
                <select
                  className="profe-calendario-select"
                  value={calendario[dia]?.rutina_id || ''}
                  onChange={(event) => actualizarDiaCalendario(dia, event.target.value || null)}
                >
                  <option value="">Descanso</option>
                  {rutinas.map((rutina) => (
                    <option key={rutina.id} value={rutina.id}>
                      {rutina.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      )}
    </ProfeLayout>
  )
}
