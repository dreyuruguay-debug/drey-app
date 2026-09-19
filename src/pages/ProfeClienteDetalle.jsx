import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { obtenerPlan } from '../data/planes.js'
import { GRUPOS_MUSCULARES } from '../data/gruposMusculares.js'
import { DIAS_SEMANA } from '../utils/dias.js'

const DESCANSOS_POR_DEFECTO = [30, 60, 90, 120]

// Detalle de un cliente: acá el profe arma sus rutinas (con series, reps,
// peso objetivo y descansos de cada ejercicio), organiza el calendario
// semanal y actualiza el progreso. Es la pantalla más grande del panel,
// por eso siempre muestra "← Volver" hacia la lista de clientes.
export default function ProfeClienteDetalle() {
  const { id } = useParams()

  const [cargando, setCargando] = useState(true)
  const [cliente, setCliente] = useState(null)
  const [rutinas, setRutinas] = useState([])
  const [ejerciciosPorRutina, setEjerciciosPorRutina] = useState({})
  const [calendario, setCalendario] = useState({})
  const [ejerciciosDisponibles, setEjerciciosDisponibles] = useState([])
  const [mensaje, setMensaje] = useState('')

  const [nombreNueva, setNombreNueva] = useState('')
  const [patronNueva, setPatronNueva] = useState('')
  const [musculosNueva, setMusculosNueva] = useState('')
  const [creandoRutina, setCreandoRutina] = useState(false)

  const [selectorEnRutina, setSelectorEnRutina] = useState(null)
  const [grupoSelector, setGrupoSelector] = useState(GRUPOS_MUSCULARES[0])
  const [busquedaSelector, setBusquedaSelector] = useState('')

  useEffect(() => {
    cargarTodo()
  }, [id])

  async function cargarTodo() {
    setCargando(true)

    const [{ data: perfil }, { data: listaRutinas }, { data: listaEjercicios }] =
      await Promise.all([
        supabase.from('perfiles').select('*').eq('id', id).single(),
        supabase.from('rutinas').select('*').eq('cliente_id', id).order('orden'),
        supabase.from('ejercicios').select('*').order('nombre'),
      ])

    setCliente(perfil || null)
    setRutinas(listaRutinas || [])
    setEjerciciosDisponibles(listaEjercicios || [])

    const rutinaIds = (listaRutinas || []).map((rutina) => rutina.id)

    const [{ data: listaRutinaEjercicios }, { data: listaCalendario }] = await Promise.all([
      rutinaIds.length > 0
        ? supabase
            .from('rutina_ejercicios')
            .select('*, ejercicios(nombre, grupo_muscular, video_url)')
            .in('rutina_id', rutinaIds)
            .order('orden')
        : Promise.resolve({ data: [] }),
      supabase
        .from('calendario_cliente')
        .select('*, rutinas(nombre)')
        .eq('cliente_id', id),
    ])

    const agrupados = {}
    for (const item of listaRutinaEjercicios || []) {
      if (!agrupados[item.rutina_id]) agrupados[item.rutina_id] = []
      agrupados[item.rutina_id].push(item)
    }
    setEjerciciosPorRutina(agrupados)

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
    const { error } = await supabase.from('rutinas').insert({
      cliente_id: id,
      nombre: nombreNueva.trim(),
      patron: patronNueva.trim(),
      musculos: musculosNueva.trim(),
      orden: rutinas.length,
    })
    setCreandoRutina(false)
    if (error) {
      setMensaje('No pudimos crear la rutina. Probá de nuevo.')
      return
    }
    setNombreNueva('')
    setPatronNueva('')
    setMusculosNueva('')
    cargarTodo()
  }

  async function handleBorrarRutina(rutinaId) {
    const { error } = await supabase.from('rutinas').delete().eq('id', rutinaId)
    if (!error) cargarTodo()
  }

  // --- Ejercicios dentro de una rutina ---

  function actualizarEjercicioLocal(rutinaId, ejercicioId, campo, valor) {
    setEjerciciosPorRutina((actual) => ({
      ...actual,
      [rutinaId]: actual[rutinaId].map((item) =>
        item.id === ejercicioId ? { ...item, [campo]: valor } : item
      ),
    }))
  }

  async function guardarEjercicio(item) {
    await supabase
      .from('rutina_ejercicios')
      .update({
        series: item.series,
        reps_objetivo: item.reps_objetivo,
        kg_objetivo: item.kg_objetivo === '' ? null : item.kg_objetivo,
        descansos: item.descansos,
      })
      .eq('id', item.id)
  }

  async function quitarEjercicio(rutinaId, itemId) {
    const { error } = await supabase.from('rutina_ejercicios').delete().eq('id', itemId)
    if (!error) {
      setEjerciciosPorRutina((actual) => ({
        ...actual,
        [rutinaId]: actual[rutinaId].filter((item) => item.id !== itemId),
      }))
    }
  }

  async function agregarEjercicio(rutinaId, ejercicioId) {
    if (!ejercicioId) return
    const orden = (ejerciciosPorRutina[rutinaId] || []).length
    const { error } = await supabase.from('rutina_ejercicios').insert({
      rutina_id: rutinaId,
      ejercicio_id: ejercicioId,
      orden,
      series: 4,
      reps_objetivo: '8',
      kg_objetivo: null,
      descansos: DESCANSOS_POR_DEFECTO,
    })
    if (!error) {
      setBusquedaSelector('')
      cargarTodo()
    }
  }

  // --- Calendario semanal ---

  async function actualizarDiaCalendario(dia, rutinaId) {
    setCalendario((actual) => ({
      ...actual,
      [dia]: rutinaId ? { ...actual[dia], dia, rutina_id: rutinaId } : { dia, rutina_id: null },
    }))
    await supabase
      .from('calendario_cliente')
      .upsert({ cliente_id: id, dia, rutina_id: rutinaId || null }, { onConflict: 'cliente_id,dia' })
  }

  const mostrarKgObjetivo = cliente?.plan !== 'rutina'

  const ejerciciosDelSelector = useMemo(() => {
    return ejerciciosDisponibles
      .filter((ejercicio) => ejercicio.grupo_muscular === grupoSelector)
      .filter((ejercicio) =>
        ejercicio.nombre.toLowerCase().includes(busquedaSelector.toLowerCase())
      )
  }, [ejerciciosDisponibles, grupoSelector, busquedaSelector])

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

          <p className="profe-seccion-label">Rutinas</p>
          {rutinas.length === 0 && (
            <p className="profe-vacio">Este cliente todavía no tiene rutinas armadas.</p>
          )}

          {rutinas.map((rutina) => (
            <div key={rutina.id} className="profe-rutina-bloque">
              <div className="profe-rutina-encabezado">
                <div>
                  <p className="profe-cliente-nombre">{rutina.nombre}</p>
                  <p className="profe-cliente-detalle">
                    {rutina.patron} · {rutina.musculos}
                  </p>
                </div>
                <button
                  type="button"
                  className="profe-ejercicio-borrar"
                  onClick={() => handleBorrarRutina(rutina.id)}
                >
                  Borrar rutina
                </button>
              </div>

              {(ejerciciosPorRutina[rutina.id] || []).length === 0 ? (
                <p className="profe-vacio">Todavía no le agregaste ejercicios.</p>
              ) : (
                <div className="profe-tabla-wrap">
                  <table className="profe-tabla">
                    <thead>
                      <tr>
                        <th>Ejercicio</th>
                        <th>Series</th>
                        <th>Reps</th>
                        {mostrarKgObjetivo && <th>Kg objetivo</th>}
                        <th>Descansos</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ejerciciosPorRutina[rutina.id] || []).map((item) => (
                        <tr key={item.id}>
                          <td>{item.ejercicios?.nombre}</td>
                          <td>
                            <input
                              className="profe-input-tabla"
                              type="number"
                              min="1"
                              value={item.series}
                              onChange={(event) =>
                                actualizarEjercicioLocal(
                                  rutina.id,
                                  item.id,
                                  'series',
                                  Number(event.target.value)
                                )
                              }
                              onBlur={() => guardarEjercicio(item)}
                            />
                          </td>
                          <td>
                            <input
                              className="profe-input-tabla"
                              type="text"
                              value={item.reps_objetivo}
                              onChange={(event) =>
                                actualizarEjercicioLocal(
                                  rutina.id,
                                  item.id,
                                  'reps_objetivo',
                                  event.target.value
                                )
                              }
                              onBlur={() => guardarEjercicio(item)}
                            />
                          </td>
                          {mostrarKgObjetivo && (
                            <td>
                              <input
                                className="profe-input-tabla"
                                type="number"
                                step="0.5"
                                value={item.kg_objetivo ?? ''}
                                onChange={(event) =>
                                  actualizarEjercicioLocal(
                                    rutina.id,
                                    item.id,
                                    'kg_objetivo',
                                    event.target.value
                                  )
                                }
                                onBlur={() => guardarEjercicio(item)}
                              />
                            </td>
                          )}
                          <td>
                            <input
                              className="profe-input-tabla profe-input-descansos"
                              type="text"
                              value={(item.descansos || []).join(', ')}
                              onChange={(event) =>
                                actualizarEjercicioLocal(
                                  rutina.id,
                                  item.id,
                                  'descansos',
                                  event.target.value
                                    .split(',')
                                    .map((valor) => Number(valor.trim()))
                                    .filter((valor) => !Number.isNaN(valor) && valor > 0)
                                )
                              }
                              onBlur={() => guardarEjercicio(item)}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="profe-ejercicio-borrar"
                              onClick={() => quitarEjercicio(rutina.id, item.id)}
                            >
                              Quitar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectorEnRutina === rutina.id ? (
                <div className="profe-selector-ejercicio">
                  <div className="profe-grupos-grid profe-grupos-grid-chico">
                    {GRUPOS_MUSCULARES.map((grupo) => (
                      <button
                        key={grupo}
                        type="button"
                        className={
                          grupo === grupoSelector
                            ? 'profe-grupo-card profe-grupo-card-activo'
                            : 'profe-grupo-card'
                        }
                        onClick={() => setGrupoSelector(grupo)}
                      >
                        {grupo}
                      </button>
                    ))}
                  </div>
                  <input
                    className="auth-input profe-buscador"
                    type="text"
                    placeholder={`Buscar en ${grupoSelector}…`}
                    value={busquedaSelector}
                    onChange={(event) => setBusquedaSelector(event.target.value)}
                  />
                  {ejerciciosDelSelector.length === 0 ? (
                    <p className="profe-vacio">No hay ejercicios de {grupoSelector} cargados.</p>
                  ) : (
                    <div className="profe-ejercicios-lista">
                      {ejerciciosDelSelector.map((ejercicio) => (
                        <div key={ejercicio.id} className="profe-ejercicio-item">
                          <span>{ejercicio.nombre}</span>
                          <button
                            type="button"
                            className="profe-ejercicio-agregar"
                            onClick={() => agregarEjercicio(rutina.id, ejercicio.id)}
                          >
                            + Agregar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    className="profe-cerrar-selector"
                    onClick={() => setSelectorEnRutina(null)}
                  >
                    Cerrar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="profe-boton-agregar-ejercicio"
                  onClick={() => {
                    setSelectorEnRutina(rutina.id)
                    setBusquedaSelector('')
                  }}
                >
                  + Agregar ejercicio
                </button>
              )}
            </div>
          ))}

          <p className="profe-seccion-label">Nueva rutina</p>
          <form className="profe-form-rutina" onSubmit={handleCrearRutina}>
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
              {creandoRutina ? 'Creando…' : 'Crear rutina'}
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
