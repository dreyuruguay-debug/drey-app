import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'

// Plantillas de rutina: se arman una sola vez (con sus ejercicios,
// métodos, series, reps, kg objetivo y descansos) y después, desde el
// detalle de cualquier cliente, se usan como punto de partida con "Usar
// plantilla". Cada plantilla se edita en su propia pantalla, la misma
// que se usa para las rutinas de los clientes (ProfeRutinaEditor).
export default function ProfePlantillas() {
  const [cargando, setCargando] = useState(true)
  const [plantillas, setPlantillas] = useState([])
  const [cantidadPorPlantilla, setCantidadPorPlantilla] = useState({})
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargarTodo()
  }, [])

  async function cargarTodo() {
    setCargando(true)
    const [{ data: lista }, { data: ejercicios }] = await Promise.all([
      supabase.from('plantillas').select('*').order('creado_en'),
      supabase.from('plantilla_ejercicios').select('plantilla_id'),
    ])
    const cantidades = {}
    for (const fila of ejercicios || []) {
      cantidades[fila.plantilla_id] = (cantidades[fila.plantilla_id] || 0) + 1
    }
    setPlantillas(lista || [])
    setCantidadPorPlantilla(cantidades)
    setCargando(false)
  }

  async function handleBorrar(plantilla) {
    if (!window.confirm(`¿Borrar la plantilla "${plantilla.nombre}"? No se puede deshacer.`)) return
    const { error } = await supabase.from('plantillas').delete().eq('id', plantilla.id)
    if (error) {
      setMensaje('No pudimos borrar la plantilla. Probá de nuevo.')
      return
    }
    setMensaje('')
    cargarTodo()
  }

  return (
    <ProfeLayout titulo="Plantillas de rutina">
      <p className="profe-nota">
        Armá acá una rutina reutilizable. Después, al crear una rutina para cualquier cliente, elegí
        "Usar plantilla" para copiarle todo de entrada y ajustar lo particular.
      </p>

      {mensaje && <p className="auth-message">{mensaje}</p>}

      <p className="profe-seccion-label">Ver plantillas</p>
      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : plantillas.length === 0 ? (
        <p className="profe-vacio">Todavía no armaste ninguna plantilla.</p>
      ) : (
        <div className="rutinas-lista-profe">
          {plantillas.map((plantilla) => (
            <div key={plantilla.id} className="profe-rutina-tarjeta">
              <Link to={`/profe/plantillas/${plantilla.id}`} className="profe-rutina-tarjeta-info">
                <p className="profe-cliente-nombre">{plantilla.nombre}</p>
                <p className="profe-cliente-detalle">
                  {plantilla.grupos_musculares?.length
                    ? plantilla.grupos_musculares.join(' · ')
                    : [plantilla.patron, plantilla.musculos].filter(Boolean).join(' · ') ||
                      'Sin grupos musculares'}
                </p>
                <p className="profe-cliente-detalle">
                  {cantidadPorPlantilla[plantilla.id] || 0} ejercicios
                </p>
              </Link>
              <div className="profe-cliente-acciones">
                <Link
                  to={`/profe/plantillas/${plantilla.id}`}
                  className="pill-button profe-boton-habilitar"
                >
                  Editar
                </Link>
                <button
                  type="button"
                  className="profe-ejercicio-borrar"
                  onClick={() => handleBorrar(plantilla)}
                >
                  Borrar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link to="/profe/plantillas/nueva" className="profe-boton-agregar-ejercicio">
        + Agregar plantilla
      </Link>
    </ProfeLayout>
  )
}
