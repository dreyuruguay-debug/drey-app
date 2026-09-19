import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { calcularEdad } from '../utils/fechas.js'

// Mis datos: nombre, fecha de nacimiento (con la edad calculada), peso,
// celular, email, objetivo y "Lesiones y/o limitaciones". Editable por
// el cliente y por el profe.
//
// Estos datos viven en la tabla "perfiles" de Supabase (la misma que
// llena Registro y que usa el panel del profe), así que guardar acá
// ya es real y permanente.
export default function MisDatos() {
  const [perfilId, setPerfilId] = useState(null)
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [peso, setPeso] = useState('')
  const [celular, setCelular] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [lesiones, setLesiones] = useState('')
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargarPerfil()
  }, [])

  async function cargarPerfil() {
    setCargando(true)
    const { data: userData } = await supabase.auth.getUser()
    const usuario = userData?.user
    if (!usuario) {
      setCargando(false)
      return
    }
    setEmail(usuario.email ?? '')

    const { data } = await supabase.from('perfiles').select('*').eq('id', usuario.id).single()
    if (data) {
      setPerfilId(data.id)
      setNombre(data.nombre || '')
      setApellido(data.apellido || '')
      setFechaNacimiento(data.fecha_nacimiento || '')
      setPeso(data.peso != null ? String(data.peso) : '')
      setCelular(data.celular || '')
      setObjetivo(data.objetivo || '')
      setLesiones(data.lesiones || '')
    }
    setCargando(false)
  }

  const edad = calcularEdad(fechaNacimiento)

  async function handleGuardar(event) {
    event.preventDefault()
    if (!perfilId) return
    setGuardando(true)
    setMensaje('')
    const { error } = await supabase
      .from('perfiles')
      .update({
        nombre,
        apellido,
        fecha_nacimiento: fechaNacimiento || null,
        peso: peso ? Number(peso) : null,
        celular,
        objetivo,
        lesiones: lesiones || null,
      })
      .eq('id', perfilId)
    setGuardando(false)
    setMensaje(error ? 'No pudimos guardar los cambios. Probá de nuevo.' : 'Datos actualizados.')
  }

  if (cargando) {
    return (
      <div className="screen has-bottom-nav">
        <TopPattern />
        <p className="profe-mensaje-carga">Cargando…</p>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="screen has-bottom-nav">
      <TopPattern />
      <div className="misdatos-contenido">
        <h1 className="misdatos-titulo">Mis datos</h1>

        <form className="registro-form" onSubmit={handleGuardar}>
          <div className="form-row">
            <input
              className="auth-input"
              type="text"
              placeholder="Nombre"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
            />
            <input
              className="auth-input"
              type="text"
              placeholder="Apellido"
              value={apellido}
              onChange={(event) => setApellido(event.target.value)}
            />
          </div>

          <div>
            <input
              className="auth-input"
              type="date"
              value={fechaNacimiento}
              onChange={(event) => setFechaNacimiento(event.target.value)}
              aria-label="Fecha de nacimiento"
            />
            {edad !== null && <p className="registro-edad">Edad: {edad} años</p>}
          </div>

          <div className="form-row">
            <input
              className="auth-input"
              type="number"
              step="0.1"
              placeholder="Peso en kg"
              value={peso}
              onChange={(event) => setPeso(event.target.value)}
            />
            <input
              className="auth-input"
              type="tel"
              placeholder="Celular"
              value={celular}
              onChange={(event) => setCelular(event.target.value)}
            />
          </div>

          <input className="auth-input" type="email" value={email} disabled />

          <input
            className="auth-input"
            type="text"
            placeholder="Objetivo"
            value={objetivo}
            onChange={(event) => setObjetivo(event.target.value)}
          />

          <textarea
            className="form-textarea"
            placeholder="Lesiones y/o limitaciones"
            value={lesiones}
            onChange={(event) => setLesiones(event.target.value)}
          />

          {mensaje && <p className="auth-message">{mensaje}</p>}

          <button type="submit" className="auth-submit" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>
      </div>
      <BottomNav />
    </div>
  )
}
