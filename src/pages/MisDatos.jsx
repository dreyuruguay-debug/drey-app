import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { calcularEdad } from '../utils/fechas.js'

// Mis datos: nombre, fecha de nacimiento (con la edad calculada), peso,
// celular, email, objetivo y "Lesiones y/o limitaciones". Editable por
// el cliente y por el profe.
//
// El email es el real de la cuenta (viene de Supabase). El resto son
// datos de ejemplo hasta conectar esta pantalla con lo que se carga en
// Registro: hoy viven en los metadatos del usuario y van a pasar a su
// propia tabla cuando construyamos el panel del profe. Por eso "Guardar
// cambios" todavía no guarda nada de forma permanente.
export default function MisDatos() {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('Nombre Apellido')
  const [fechaNacimiento, setFechaNacimiento] = useState('1998-01-01')
  const [peso, setPeso] = useState('')
  const [celular, setCelular] = useState('')
  const [objetivo, setObjetivo] = useState('Recomposición corporal')
  const [lesiones, setLesiones] = useState('')
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const usuario = data?.user
      if (!usuario) return
      setEmail(usuario.email ?? '')

      const metadatos = usuario.user_metadata || {}
      if (metadatos.nombre) {
        setNombre(`${metadatos.nombre} ${metadatos.apellido || ''}`.trim())
      }
      if (metadatos.fecha_nacimiento) setFechaNacimiento(metadatos.fecha_nacimiento)
      if (metadatos.peso) setPeso(String(metadatos.peso))
      if (metadatos.celular) setCelular(metadatos.celular)
      if (metadatos.objetivo) setObjetivo(metadatos.objetivo)
      if (metadatos.lesiones) setLesiones(metadatos.lesiones)
    })
  }, [])

  const edad = calcularEdad(fechaNacimiento)

  function handleGuardar(event) {
    event.preventDefault()
    // Por ahora esto no se guarda en ningún lado todavía: falta la
    // tabla de clientes. Cuando exista, acá va un update a Supabase.
    setGuardado(true)
  }

  return (
    <div className="screen has-bottom-nav">
      <TopPattern />
      <div className="misdatos-contenido">
        <h1 className="misdatos-titulo">Mis datos</h1>

        <form className="registro-form" onSubmit={handleGuardar}>
          <input
            className="auth-input"
            type="text"
            placeholder="Nombre y apellido"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
          />

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

          {guardado && <p className="auth-message">Datos actualizados.</p>}

          <button type="submit" className="auth-submit">
            Guardar cambios
          </button>
        </form>
      </div>
      <BottomNav />
    </div>
  )
}
