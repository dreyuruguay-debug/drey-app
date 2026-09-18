import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'

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

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setMessage('Email o contraseña incorrectos.')
      return
    }
    navigate('/inicio')
  }

  async function handleForgotPassword() {
    if (!email) {
      setMessage('Escribí tu email arriba y volvé a tocar "Olvidé mi contraseña".')
      return
    }
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    setMessage(
      error
        ? 'No pudimos enviar el email. Probá de nuevo.'
        : 'Te enviamos un email para elegir una nueva contraseña.'
    )
  }

  return (
    <main className="auth-screen">
      <h1 className="auth-logo">DREY</h1>

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

// Ícono de "ojo" simple, sin depender de ninguna librería de íconos.
function EyeIcon({ crossed }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <line x1="2" y1="22" x2="22" y2="2" />}
    </svg>
  )
}
