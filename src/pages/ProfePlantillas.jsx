import { useEffect, useMemo, useState } from 'react'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { GRUPOS_MUSCULARES } from '../data/gruposMusculares.js'

const DESCANSOS_POR_DEFECTO = [30, 60, 90, 120]

// Plantillas de rutina: se arma acá una sola vez (con sus ejercicios,
// series, reps, kg objetivo y descansos) y después, desde el detalle
// de cualquier cliente, se puede "Usar plantilla" al crear una rutina
// nueva para copiarle todo esto de entrada — ahí se puede seguir
// ajustando lo particular de ese cliente sin tocar la plantilla.
export default function ProfePlantillas() {
  const [cargando, setCargando] = useState(true)
  const [plantillas, setPlantillas] = useState([])
  const [ejerciciosPorPlantilla, setEjerciciosPorPlantilla] = useState({})
  const [ejerciciosDisponibles, setEjerciciosDisponibles] = useState([])
  const [mensaje, setMensaje] = useState('')

  const [nombreNueva, setNombreNueva] = useState('')
  const [patronNueva, setPatronNueva] = useState('')
  const [musculosNueva, setMusculosNueva] = useState('')
  const [creando, setCreando] = useState(false)

  const [selectorEnPlantilla, setSelectorEnPlantilla] = useState(null)
  const [grupoSelector, setGrupoSelector] = useState(GRUPOS_MUSCULARES[0])
  const [busquedaSelector, setBusquedaSelector] = useState('')

  useEffect(() => {
    cargarTodo()
  }, [])

  async function cargarTodo() {
    setCargando(true)
    const [{ data: listaPlantillas }, { data: listaEjercicios }] = await Promise.all([
      supabase.from('plantillas').select('*').order('creado_en'),
      supabase.from('ejercicios').select('*').order('nombre'),
    ])
    setPlantillas(listaPlantillas || [])
    setEjerciciosDisponibles(listaEjercicios || [])

    const plantillaIds = (listaPlantillas || []).map((plantilla) => plantilla.id)
    const { data: listaPlantillaEjercicios } =
      plantillaIds.length > 0
        ? await supabase
            .from('plantilla_ejercicios')
            .select('*, ejercicios(nombre, grupo_muscular, imagen_url)')
            .in('plantilla_id', plantillaIds)
            .order('orden')
        : { data: [] }

    const agrupados = {}
    for (const item of listaPlantillaEjercicios || []) {
      if (!agrupados[item.plantilla_id]) agrupados[item.plantilla_id] = []
      agrupados[item.plantilla_id].push(item)
    }
    setEjerciciosPorPlantilla(agrupados)

    setCargando(false)
  }

  async function handleCrearPlantilla(event) {
    event.preventDefault()
    if (!nombreNueva.trim()) return
    setCreando(true)
    setMensaje('')
    const { error } = await supabase.from('plantillas').insert({
      nombre: nombreNueva.trim(),
      patron: patronNueva.trim(),
      musculos: musculosNueva.trim(),
    })
    setCreando(false)
    if (error) {
      setMensaje('No pudimos crear la plantilla. Probá de nuevo.')
      return
    }
    setNombreNueva('')
    setPatronNueva('')
    setMusculosNueva('')
    cargarTodo()
  }

  async function handleBorrarPlantilla(plantillaId) {
    const { error } = await supabase.from('plantillas').delete().eq('id', plantillaId)
    if (!error) cargarTodo()
  }

  function actualizarEjercicioLocal(plantillaId, itemId, campo, valor) {
    setEjerciciosPorPlantilla((actual) => ({
      ...actual,
      [plantillaId]: actual[plantillaId].map((item) =>
        item.id === itemId ? { ...item, [campo]: valor } : item
      ),
    }))
  }

  async function guardarEjercicio(item) {
    await supabase
      .from('plantilla_ejercicios')
      .update({
        series: item.series,
        reps_objetivo: item.reps_objetivo,
        kg_objetivo: item.kg_objetivo === '' ? null : item.kg_objetivo,
        descansos: item.descansos,
      })
      .eq('id', item.id)
  }

  async function quitarEjercicio(plantillaId, itemId) {
    const { error } = await supabase.from('plantilla_ejercicios').delete().eq('id', itemId)
    if (!error) {
      setEjerciciosPorPlantilla((actual) => ({
        ...actual,
        [plantillaId]: actual[plantillaId].filter((item) => item.id !== itemId),
      }))
    }
  }

  async function agregarEjercicio(plantillaId, ejercicioId) {
    if (!ejercicioId) return
    const orden = (ejerciciosPorPlantilla[plantillaId] || []).length
    const { error } = await supabase.from('plantilla_ejercicios').insert({
      plantilla_id: plantillaId,
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

  const ejerciciosDelSelector = useMemo(() => {
    return ejerciciosDisponibles
      .filter((ejercicio) => ejercicio.grupo_muscular === grupoSelector)
      .filter((ejercicio) =>
        ejercicio.nombre.toLowerCase().includes(busquedaSelector.toLowerCase())
      )
  }, [ejerciciosDisponibles, grupoSelector, busquedaSelector])

  return (
    <ProfeLayout titulo="Plantillas de rutina">
      <p className="profe-nota">
        Armá acá una rutina reutilizable. Después, al crear una rutina nueva para cualquier
        cliente en "Clientes y rutinas", vas a poder elegir "Usar plantilla" para copiarle estos
        ejercicios de entrada y ajustar lo que haga falta en ese cliente puntual.
      </p>

      {mensaje && <p className="auth-message">{mensaje}</p>}

      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : (
        <>
          {plantillas.length === 0 && (
            <p className="profe-vacio">Todavía no armaste ninguna plantilla.</p>
          )}

          {plantillas.map((plantilla) => (
            <div key={plantilla.id} className="profe-rutina-bloque">
              <div className="profe-rutina-encabezado">
                <div>
                  <p className="profe-cliente-nombre">{plantilla.nombre}</p>
                  <p className="profe-cliente-detalle">
                    {plantilla.patron} · {plantilla.musculos}
                  </p>
                </div>
                <button
                  type="button"
                  className="profe-ejercicio-borrar"
                  onClick={() => handleBorrarPlantilla(plantilla.id)}
                >
                  Borrar plantilla
                </button>
              </div>

              {(ejerciciosPorPlantilla[plantilla.id] || []).length === 0 ? (
                <p className="profe-vacio">Todavía no le agregaste ejercicios.</p>
              ) : (
                <div className="profe-tabla-wrap">
                  <table className="profe-tabla">
                    <thead>
                      <tr>
                        <th>Ejercicio</th>
                        <th>Series</th>
                        <th>Reps</th>
                        <th>Kg objetivo</th>
                        <th>Descansos</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ejerciciosPorPlantilla[plantilla.id] || []).map((item) => (
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
                                  plantilla.id,
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
                                  plantilla.id,
                                  item.id,
                                  'reps_objetivo',
                                  event.target.value
                                )
                              }
                              onBlur={() => guardarEjercicio(item)}
                            />
                          </td>
                          <td>
                            <input
                              className="profe-input-tabla"
                              type="number"
                              step="0.5"
                              value={item.kg_objetivo ?? ''}
                              onChange={(event) =>
                                actualizarEjercicioLocal(
                                  plantilla.id,
                                  item.id,
                                  'kg_objetivo',
                                  event.target.value
                                )
                              }
                              onBlur={() => guardarEjercicio(item)}
                            />
                          </td>
                          <td>
                            <input
                              className="profe-input-tabla profe-input-descansos"
                              type="text"
                              value={(item.descansos || []).join(', ')}
                              onChange={(event) =>
                                actualizarEjercicioLocal(
                                  plantilla.id,
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
                              onClick={() => quitarEjercicio(plantilla.id, item.id)}
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

              {selectorEnPlantilla === plantilla.id ? (
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
                          <div className="profe-ejercicio-item-info">
                            {ejercicio.imagen_url && (
                              <img
                                src={ejercicio.imagen_url}
                                alt={ejercicio.nombre}
                                className="profe-ejercicio-foto-mini"
                              />
                            )}
                            <span>{ejercicio.nombre}</span>
                          </div>
                          <button
                            type="button"
                            className="profe-ejercicio-agregar"
                            onClick={() => agregarEjercicio(plantilla.id, ejercicio.id)}
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
                    onClick={() => setSelectorEnPlantilla(null)}
                  >
                    Cerrar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="profe-boton-agregar-ejercicio"
                  onClick={() => {
                    setSelectorEnPlantilla(plantilla.id)
                    setBusquedaSelector('')
                  }}
                >
                  + Agregar ejercicio
                </button>
              )}
            </div>
          ))}

          <p className="profe-seccion-label">Nueva plantilla</p>
          <form className="profe-form-rutina" onSubmit={handleCrearPlantilla}>
            <input
              className="auth-input"
              type="text"
              placeholder="Nombre (ej: Full body principiante)"
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
            <button type="submit" className="pill-button" disabled={creando}>
              {creando ? 'Creando…' : 'Crear plantilla'}
            </button>
          </form>
        </>
      )}
    </ProfeLayout>
  )
}
