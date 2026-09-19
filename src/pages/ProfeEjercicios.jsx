import { useEffect, useState } from 'react'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { GRUPOS_MUSCULARES } from '../data/gruposMusculares.js'

// Biblioteca de ejercicios, agrupada por músculo, con buscador dentro
// de cada grupo. Estos son los ejercicios que después se usan para
// armar la rutina de cada cliente (ver "Clientes y rutinas" → un
// cliente → "+ Agregar ejercicio" dentro de una rutina).
//
// Acá solo se administra la lista: crear, editar (nombre, foto, link de
// video) y borrar. Asignarle series/reps/peso a un cliente puntual se
// hace en el detalle de ese cliente, no acá.
export default function ProfeEjercicios() {
  const [ejercicios, setEjercicios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [grupoActivo, setGrupoActivo] = useState(GRUPOS_MUSCULARES[0])

  const [nombreNuevo, setNombreNuevo] = useState('')
  const [videoNuevo, setVideoNuevo] = useState('')
  const [imagenNueva, setImagenNueva] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const [editandoId, setEditandoId] = useState(null)
  const [nombreEdit, setNombreEdit] = useState('')
  const [videoEdit, setVideoEdit] = useState('')
  const [imagenEdit, setImagenEdit] = useState(null)
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)

  useEffect(() => {
    cargarEjercicios()
  }, [])

  async function cargarEjercicios() {
    setCargando(true)
    const { data } = await supabase.from('ejercicios').select('*').order('nombre')
    setEjercicios(data || [])
    setCargando(false)
  }

  // Sube una foto al almacenamiento de Supabase (bucket público
  // "ejercicios-fotos") y devuelve el link para guardar en la fila del
  // ejercicio. Si falla la subida, devuelve null y no rompe el guardado
  // del resto de los datos.
  async function subirImagen(archivo) {
    const ruta = `${Date.now()}-${archivo.name}`
    const { error } = await supabase.storage.from('ejercicios-fotos').upload(ruta, archivo)
    if (error) return null
    const { data } = supabase.storage.from('ejercicios-fotos').getPublicUrl(ruta)
    return data?.publicUrl || null
  }

  async function handleAgregar(event) {
    event.preventDefault()
    const nombreLimpio = nombreNuevo.trim()
    if (!nombreLimpio) return

    // Evita crear un ejercicio "duplicado" por error (por ejemplo, para
    // agregarle una foto a uno que ya existe). Si ya hay uno con ese
    // nombre, avisa y no lo crea: hay que usar "Editar" en el de la lista.
    const yaExiste = ejercicios.some(
      (ejercicio) => ejercicio.nombre.trim().toLowerCase() === nombreLimpio.toLowerCase()
    )
    if (yaExiste) {
      setMensaje(
        `Ya existe un ejercicio llamado "${nombreLimpio}". Para agregarle foto o video, buscalo arriba y tocá "Editar" en vez de crear uno nuevo.`
      )
      return
    }

    setGuardando(true)
    setMensaje('')

    let imagenUrl = null
    if (imagenNueva) {
      imagenUrl = await subirImagen(imagenNueva)
    }

    const { error } = await supabase.from('ejercicios').insert({
      nombre: nombreNuevo.trim(),
      grupo_muscular: grupoActivo,
      video_url: videoNuevo.trim() || null,
      imagen_url: imagenUrl,
    })
    setGuardando(false)
    if (error) {
      setMensaje('No pudimos guardar el ejercicio. Probá de nuevo.')
      return
    }
    setNombreNuevo('')
    setVideoNuevo('')
    setImagenNueva(null)
    cargarEjercicios()
  }

  async function handleBorrar(id) {
    const { error } = await supabase.from('ejercicios').delete().eq('id', id)
    if (!error) cargarEjercicios()
  }

  function empezarEdicion(ejercicio) {
    setEditandoId(ejercicio.id)
    setNombreEdit(ejercicio.nombre)
    setVideoEdit(ejercicio.video_url || '')
    setImagenEdit(null)
    setMensaje('')
  }

  function cancelarEdicion() {
    setEditandoId(null)
  }

  async function guardarEdicion(ejercicio) {
    if (!nombreEdit.trim()) return
    setGuardandoEdicion(true)
    setMensaje('')

    let imagenUrl = ejercicio.imagen_url || null
    if (imagenEdit) {
      const subida = await subirImagen(imagenEdit)
      if (subida) imagenUrl = subida
    }

    const { error } = await supabase
      .from('ejercicios')
      .update({
        nombre: nombreEdit.trim(),
        video_url: videoEdit.trim() || null,
        imagen_url: imagenUrl,
      })
      .eq('id', ejercicio.id)

    setGuardandoEdicion(false)
    if (error) {
      setMensaje('No pudimos guardar los cambios. Probá de nuevo.')
      return
    }
    setEditandoId(null)
    cargarEjercicios()
  }

  const ejerciciosDelGrupo = ejercicios
    .filter((ejercicio) => ejercicio.grupo_muscular === grupoActivo)
    .filter((ejercicio) => ejercicio.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <ProfeLayout titulo="Biblioteca de ejercicios">
      <p className="profe-nota">
        Elegí un grupo muscular, buscá, agregá o editá ejercicios (nombre, foto y link de video).
        Para asignarle uno a un cliente, entrá a "Clientes y rutinas" → el cliente → su rutina →
        "+ Agregar ejercicio".
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

      {mensaje && <p className="auth-message">{mensaje}</p>}

      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : ejerciciosDelGrupo.length === 0 ? (
        <p className="profe-vacio">Todavía no hay ejercicios de {grupoActivo}.</p>
      ) : (
        <div className="profe-ejercicios-lista">
          {ejerciciosDelGrupo.map((ejercicio) =>
            editandoId === ejercicio.id ? (
              <div key={ejercicio.id} className="profe-ejercicio-edicion">
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Nombre del ejercicio"
                  value={nombreEdit}
                  onChange={(event) => setNombreEdit(event.target.value)}
                  required
                />
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Link del video (opcional)"
                  value={videoEdit}
                  onChange={(event) => setVideoEdit(event.target.value)}
                />
                <div className="profe-imagen-actual">
                  {ejercicio.imagen_url && (
                    <img
                      src={ejercicio.imagen_url}
                      alt={ejercicio.nombre}
                      className="profe-ejercicio-foto-preview"
                    />
                  )}
                  <label className="profe-adjuntar-imagen">
                    {imagenEdit ? imagenEdit.name : 'Cambiar foto (opcional)'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setImagenEdit(event.target.files?.[0] ?? null)}
                      hidden
                    />
                  </label>
                </div>
                <div className="profe-ejercicio-edicion-botones">
                  <button
                    type="button"
                    className="pill-button"
                    disabled={guardandoEdicion}
                    onClick={() => guardarEdicion(ejercicio)}
                  >
                    {guardandoEdicion ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button
                    type="button"
                    className="profe-cerrar-selector"
                    onClick={cancelarEdicion}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
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
                <div className="profe-ejercicio-item-acciones">
                  <button
                    type="button"
                    className="profe-ejercicio-agregar"
                    onClick={() => empezarEdicion(ejercicio)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="profe-ejercicio-borrar"
                    onClick={() => handleBorrar(ejercicio.id)}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      <p className="profe-seccion-label">Agregar ejercicio a {grupoActivo}</p>
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
        <label className="profe-adjuntar-imagen">
          {imagenNueva ? imagenNueva.name : 'Adjuntar foto (opcional)'}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setImagenNueva(event.target.files?.[0] ?? null)}
            hidden
          />
        </label>
        <button type="submit" className="pill-button" disabled={guardando}>
          {guardando ? 'Agregando…' : 'Agregar'}
        </button>
      </form>
    </ProfeLayout>
  )
}
