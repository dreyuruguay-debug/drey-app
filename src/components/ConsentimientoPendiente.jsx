import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CasillasConsentimiento from './CasillasConsentimiento.jsx'
import { aceptarTerminos } from '../services/privacidad.js'
import { supabase } from '../services/supabaseClient.js'

// Pantalla que ve una vez el alumno que todavía no aceptó la versión
// actual de los términos y la política de privacidad (las cuentas que ya
// existían antes, o cuando se publica una versión nueva). Hasta que no
// acepte, no sigue.
export default function ConsentimientoPendiente({ onAceptado }) {
  const navigate = useNavigate()
  const [terminos, setTerminos] = useState(false)
  const [salud, setSalud] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function aceptar() {
    if (!terminos || !salud) {
      setMensaje('Para seguir usando DREY tenés que marcar las dos casillas.')
      return
    }
    setGuardando(true)
    setMensaje('')
    const error = await aceptarTerminos(true)
    setGuardando(false)
    if (error) {
      setMensaje('No pudimos guardarlo. Revisá tu conexión y probá de nuevo.')
      return
    }
    onAceptado()
  }

  async function salir() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <main className="auth-screen">
      <img src="/drey-logo.png" alt="DREY" className="auth-logo-img" />
      <p className="registro-gracias-titulo">Cuidamos tus datos</p>
      <p className="registro-gracias-texto">
        Para seguir, necesitamos que leas y aceptes cómo usamos tus datos. Es un minuto.
      </p>
      <div className="registro-form">
        <CasillasConsentimiento
          terminos={terminos}
          salud={salud}
          onTerminos={setTerminos}
          onSalud={setSalud}
        />
        {mensaje && <p className="auth-message">{mensaje}</p>}
        <button type="button" className="auth-submit" onClick={aceptar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Aceptar y seguir'}
        </button>
        <button type="button" className="registro-boton-secundario" onClick={salir}>
          Ahora no (cerrar sesión)
        </button>
      </div>
    </main>
  )
}
