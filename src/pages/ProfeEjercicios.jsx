import { useEffect, useState } from 'react'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { GRUPOS_MUSCULARES } from '../data/gruposMusculares.js'

// Biblioteca de ejercicios, agrupada por músculo, con buscador dentro
// de cada grupo. Estos son los ejercicios que después se usan para
// armar la rutina de cada cliente (ver "Clientes y rutinas").
export default function ProfeEjercicios() {
  const [ejercicios, setEjercicios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [grupoActivo, setGrupoActivo] = useState(GRUPOS_MUSCULARES[0])
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [videoNuevo, setVideoNuevo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargarEjercicios()
  }, [])

  async function cargarEjercicios() {
    setCargando(true)
    const { data } = await supabase.from('ejercicios').select('*').order('nombre')
    setEjercicios(data || [])
    setCargando(false)
  }

  async function handleAgregar(event) {
    event.preventDefault()
    if (!nombreNuevo.trim()) return
    setGuardando(true)
    setMensaje('')
    const { error } = await supabase.from('ejercicios').insert({
      nombre: nombreNuevo.trim(),
      grupo_muscular: grupoActivo,
      video_url: videoNuevo.trim() || null,
    })
    setGuardando(false)
    if (error) {
      setMensaje('No pudimos guardar el ejercicio. Probá de nuevo.')
      return
    }
    setNombreNuevo('')
    setVideoNuevo('')
    cargarEjercicios()
  }

  async function handleBorrar(id) {
    const { error } = await supabase.from('ejercicios').delete().eq('id', id)
    if (!error) cargarEjercicios()
  }

  const ejerciciosDelGrupo = ejercicios
    .filter((ejercicio) => ejercicio.grupo_muscular === grupoActivo)
    .filter((ejercicio) => ejercicio.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <ProfeLayout titulo="Biblioteca de ejercicios">
      <p className="profe-nota">
        Elegí un grupo muscular, buscá o agregá ejercicios. Estos son los que después vas a poder
        usar para armar las rutinas de cada cliente.
      </p>

      <div className="profe-grupos-grid">
        {GRUPOS_MUSCULARES.map((grupo) => (
          <button
            key={grupo}
            type="button"
            className={
              grupo === grupoActivo
                ? 'profe-grupo-card profe-grupo-card-activo'
                : 'profe-grupo-card'
            }
            onClick={() => setGrupoActivo(grupo)}
          >
            {grupo}
          </button>
        ))}
      </div>

      <input
        className="auth-input profe-buscador"
        type="text"
        placeholder={`Buscar en ${grupoActivo}…`}
        value={busqueda}
        onChange={(event) => setBusqueda(event.target.value)}
      />

      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : ejerciciosDelGrupo.length === 0 ? (
        <p className="profe-vacio">Todavía no hay ejercicios de {grupoActivo}.</p>
      ) : (
        <div className="profe-ejercicios-lista">
          {ejerciciosDelGrupo.map((ejercicio) => (
            <div key={ejercicio.id} className="profe-ejercicio-item">
              <span>{ejercicio.nombre}</span>
              <button
                type="button"
                className="profe-ejercicio-borrar"
                onClick={() => handleBorrar(ejercicio.id)}
              >
                Borrar
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="profe-seccion-label">Agregar ejercicio a {grupoActivo}</p>
      {mensaje && <p className="auth-message">{mensaje}</p>}
      <form className="profe-form-ejercicio" onSubmit={handleAgregar}>
        <input
          className="auth-input"
          type="text"
          placeholder="Nombre del ejercicio"
          value={nombreNuevo}
          onChange={(event) => setNombreNuevo(event.target.value)}
          required
        />
        <input
          className="auth-input"
          type="text"
          placeholder="Link del video (opcional)"
          value={videoNuevo}
          onChange={(event) => setVideoNuevo(event.target.value)}
        />
        <button type="submit" className="pill-button" disabled={guardando}>
          {guardando ? 'Agregando…' : 'Agregar'}
        </button>
      </form>
    </ProfeLayout>
  )
}
