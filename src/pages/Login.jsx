import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import { entraAlPanel } from '../utils/roles.js'
import EyeIcon from '../components/EyeIcon.jsx'

// Pantalla de login, siguiendo el diseño original: logo DREY, campo de
// email, campo de contraseña con botón para mostrar/ocultar, link de
// "Olvidé mi contraseña", botón "Iniciar sesión" y link "Registrarme".
export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  // Si ya tiene la sesión abierta (por ejemplo, volvió del link del mail de
  // confirmación), entra directo sin volver a escribir la contraseña.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const usuario = data?.session?.user
      if (!usuario) return
      const { data: perfil } = await supabase
        .from('perfiles')
        .select('es_profe, es_admin')
        .eq('id', usuario.id)
        .single()
      navigate(entraAlPanel(perfil) ? '/profe' : '/inicio', { replace: true })
    })
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')
    setLoading(true)
    const { data: loginData, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      setMessage(
        error.message.toLowerCase().includes('email not confirmed')
          ? 'Todavía no confirmaste tu email. Revisá tu correo (carpeta de spam incluida) y tocá el link que te mandamos.'
          : 'Email o contraseña incorrectos.'
      )
      return
    }

    // Si la cuenta es de un profe o la del Admin, entra directo al panel en vez de
    // a la pantalla de Inicio del cliente.
    const { data: perfil } = await supabase
      .from('perfiles')
      .select('es_profe, es_admin')
      .eq('id', loginData.user.id)
      .single()
    setLoading(false)
    navigate(entraAlPanel(perfil) ? '/profe' : '/inicio')
  }

  async function handleForgotPassword() {
    if (!email) {
      setMessage('Escribí tu email arriba y volvé a tocar "Olvidé mi contraseña".')
      return
    }
    setMessage('')
    // El link del mail lleva a "Elegí tu contraseña nueva".
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nueva-contrasena`,
    })
    setMessage(
      error
        ? 'No pudimos enviar el email. Probá de nuevo.'
        : 'Te enviamos un email para elegir una nueva contraseña.'
    )
  }

  return (
    <main className="auth-screen">
      <img src="/drey-logo.png" alt="DREY" className="auth-logo-img" />

      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          className="auth-input"
          type="email"
          placeholder="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <div className="auth-input-wrap">
          <input
            className="auth-input"
            type={showPassword ? 'text' : 'password'}
            placeholder="contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button
            type="button"
            className="auth-eye-btn"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <EyeIcon crossed={showPassword} />
          </button>
        </div>

        <button type="button" className="auth-forgot" onClick={handleForgotPassword}>
          Olvidé mi contraseña
        </button>

        {message && <p className="auth-message">{message}</p>}

        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>

      <Link to="/registro" className="auth-switch">
        Registrarme
      </Link>
    </main>
  )
}
