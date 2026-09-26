import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import { entraAlPanel } from '../utils/roles.js'
import EyeIcon from '../components/EyeIcon.jsx'

// "Elegí tu contraseña nueva". Acá llega la persona desde el link del
// mail de "Olvidé mi contraseña" (Login). Supabase la deja con una sesión
// temporal y desde acá guarda la contraseña nueva.
//
// Para que el link del mail traiga acá, esta dirección tiene que estar en
// Supabase → Authentication → URL Configuration → Redirect URLs (LEEME).
export default function NuevaContrasena() {
  const navigate = useNavigate()
  const [listo, setListo] = useState(false)
  const [sinSesion, setSinSesion] = useState(false)
  const [password, setPassword] = useState('')
  const [repetir, setRepetir] = useState('')
  const [ver, setVer] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    // Supabase lee el link solo; se espera un momento a que termine.
    const { data } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (sesion && (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN')) setListo(true)
    })
    const temporizador = setTimeout(async () => {
      const { data: actual } = await supabase.auth.getSession()
      if (actual?.session) setListo(true)
      else setSinSesion(true)
    }, 1500)
    return () => {
      data.subscription.unsubscribe()
      clearTimeout(temporizador)
    }
  }, [])

  async function guardar(event) {
    event.preventDefault()
    if (password.length < 6) {
      setMensaje('La contraseña tiene que tener al menos 6 caracteres.')
      return
    }
    if (password !== repetir) {
      setMensaje('Las contraseñas no coinciden.')
      return
    }
    setGuardando(true)
    setMensaje('')
    const { data, error } = await supabase.auth.updateUser({ password })
    setGuardando(false)
    if (error) {
      setMensaje('No pudimos cambiarla. Pedí un mail nuevo desde "Olvidé mi contraseña".')
      return
    }
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('es_profe, es_admin')
      .eq('id', data.user.id)
      .single()
    navigate(entraAlPanel(perfil) ? '/profe' : '/inicio', { replace: true })
  }

  return (
    <main className="auth-screen">
      <img src="/drey-logo.png" alt="DREY" className="auth-logo-img" />
      <p className="registro-gracias-titulo">Contraseña nueva</p>
      {sinSesion && !listo ? (
        <>
          <p className="registro-gracias-texto">
            El link venció o ya se usó. Pedí uno nuevo desde "Olvidé mi contraseña".
          </p>
          <button type="button" className="auth-submit" onClick={() => navigate('/')}>
            Ir a iniciar sesión
          </button>
        </>
      ) : (
        <form className="auth-form" onSubmit={guardar}>
          <div className="auth-input-wrap">
            <input
              className="auth-input"
              type={ver ? 'text' : 'password'}
              placeholder="contraseña nueva"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="auth-eye-btn"
              onClick={() => setVer((valor) => !valor)}
              aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <EyeIcon crossed={ver} />
            </button>
          </div>
          <input
            className="auth-input"
            type={ver ? 'text' : 'password'}
            placeholder="repetir contraseña"
            value={repetir}
            onChange={(event) => setRepetir(event.target.value)}
            autoComplete="new-password"
          />
          {mensaje && <p className="auth-message">{mensaje}</p>}
          <button type="submit" className="auth-submit" disabled={!listo || guardando}>
            {guardando ? 'Guardando…' : listo ? 'Guardar contraseña' : 'Un momento…'}
          </button>
        </form>
      )}
    </main>
  )
}
