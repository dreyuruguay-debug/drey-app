import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import ListaRutinasCliente from '../components/ListaRutinasCliente.jsx'
import { supabase } from '../services/supabaseClient.js'
import { cargarRutinasDeCliente } from '../services/rutinas.js'
import { obtenerPlan } from '../data/planes.js'
import { DIAS_SEMANA } from '../utils/dias.js'

// Detalle de un cliente: su progreso reciente, sus rutinas (el mismo
// listado que en la sección "Rutinas", con "+ Agregar rutina") y el
// calendario semanal. Cada rutina se arma con el asistente paso a paso
// (ProfeRutinaNueva → ProfeRutinaEditor).
export default function ProfeClienteDetalle() {
  const { id } = useParams()

  const [cargando, setCargando] = useState(true)
  const [cliente, setCliente] = useState(null)
  const [rutinas, setRutinas] = useState([])
  const [cantidadPorRutina, setCantidadPorRutina] = useState({})
  const [calendario, setCalendario] = useState({})
  const [sesiones, setSesiones] = useState([])

  useEffect(() => {
    cargarTodo()
  }, [id])

  async function cargarTodo() {
    setCargando(true)

    const [{ data: perfil }, resultadoRutinas, { data: listaSesiones }, { data: listaCalendario }] =
      await Promise.all([
        supabase.from('perfiles').select('*').eq('id', id).single(),
        cargarRutinasDeCliente(id),
        supabase
          .from('sesiones')
          .select('*, rutinas(nombre)')
          .eq('cliente_id', id)
          .order('fecha', { ascending: false })
          .limit(8),
        supabase.from('calendario_cliente').select('*, rutinas(nombre)').eq('cliente_id', id),
      ])

    setCliente(perfil || null)
    setRutinas(resultadoRutinas.rutinas)
    setCantidadPorRutina(resultadoRutinas.cantidades)
    setSesiones(listaSesiones || [])

    const diasMap = {}
    for (const fila of listaCalendario || []) {
      diasMap[fila.dia] = fila
    }
    setCalendario(diasMap)

    setCargando(false)
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
  // En el calendario solo se pueden asignar rutinas ya guardadas (las que
  // están en borrador el cliente todavía no las ve).
  const rutinasGuardadas = rutinas.filter((rutina) => rutina.publicada !== false)

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
            Si el cliente viene levantando fácil, subile el peso objetivo del ejercicio en la rutina
            (botón Editar).
          </p>

          <p className="profe-seccion-label">Rutinas</p>
          <ListaRutinasCliente
            clienteId={id}
            rutinas={rutinas}
            cantidades={cantidadPorRutina}
            onCambio={cargarTodo}
          />

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
                  {rutinasGuardadas.map((rutina) => (
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
