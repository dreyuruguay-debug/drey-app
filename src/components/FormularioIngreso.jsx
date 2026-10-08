import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import { verificarProfe } from '../services/accesoProfe.js'
import EyeIcon from './EyeIcon.jsx'

// Formulario para iniciar sesión: email, contraseña (con el ojo para
// mostrarla), "Olvidé mi contraseña" y "Entrar". Va dentro de la hoja que
// sube desde abajo en la página de inicio (components/portada/HojaIngreso.jsx).
//
// Al entrar va directo a su pantalla: el panel ("/profe") si es profe o
// la cuenta Admin, Inicio ("/inicio") si es alumno.
//
//   onRegistrarme: "¿No tenés cuenta? Registrarme".
// (Poner el cursor en el email al abrir lo hace la hoja: HojaIngreso.jsx.)
export default function FormularioIngreso({ onRegistrarme }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [entrando, setEntrando] = useState(false)
  const campoEmail = useRef(null)

  async function entrar(event) {
    event.preventDefault()
    setMensaje(null)
    setEntrando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setEntrando(false)
      setMensaje({ tipo: 'error', texto: textoDeError(error) })
      return
    }
    // Profe o Admin → panel; alumno → Inicio. verificarProfe además lo
    // deja recordado en el celular (así la próxima vez entra al instante).
    const { esProfe } = await verificarProfe()
    navigate(esProfe ? '/profe' : '/inicio', { replace: true })
  }

  async function olvideMiContrasena() {
    if (!email.trim()) {
      setMensaje({
        tipo: 'aviso',
        texto: 'Escribí tu email arriba y volvé a tocar "Olvidé mi contraseña".',
      })
      campoEmail.current?.focus()
      return
    }
    setMensaje(null)
    // El link del mail lleva a "Elegí tu contraseña nueva".
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nueva-contrasena`,
    })
    setMensaje(
      error
        ? { tipo: 'error', texto: 'No pudimos enviar el email. Probá de nuevo.' }
        : { tipo: 'aviso', texto: 'Te enviamos un email para elegir una nueva contraseña.' },
    )
  }

  return (
    <form className="ingreso" onSubmit={entrar}>
      <label className="ingreso-campo">
        <span className="ingreso-etiqueta">Email</span>
        <input
          ref={campoEmail}
          className="ingreso-input"
          type="email"
          inputMode="email"
          autoComplete="username"
          placeholder="tu@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>

      <label className="ingreso-campo">
        <span className="ingreso-etiqueta">Contraseña</span>
        <span className="ingreso-input-con-ojo">
          <input
            className="ingreso-input"
            type={verPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Tu contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button
            type="button"
            className="ingreso-ojo"
            onClick={() => setVerPassword((valor) => !valor)}
            aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <EyeIcon crossed={verPassword} />
          </button>
        </span>
      </label>

      <button type="button" className="ingreso-olvide" onClick={olvideMiContrasena}>
        Olvidé mi contraseña
      </button>

      {mensaje && (
        <p
          className={
            mensaje.tipo === 'error' ? 'ingreso-mensaje ingreso-mensaje-error' : 'ingreso-mensaje'
          }
          role={mensaje.tipo === 'error' ? 'alert' : 'status'}
        >
          {mensaje.texto}
        </p>
      )}

      <button type="submit" className="ingreso-entrar" disabled={entrando}>
        {entrando ? 'Entrando…' : 'Entrar'}
      </button>

      {onRegistrarme && (
        <button type="button" className="ingreso-enlace" onClick={onRegistrarme}>
          ¿No tenés cuenta? <strong>Registrarme</strong>
        </button>
      )}
    </form>
  )
}

function textoDeError(error) {
  const texto = String(error?.message || '').toLowerCase()
  if (texto.includes('email not confirmed')) {
    return 'Todavía no confirmaste tu email. Revisá tu correo (carpeta de spam incluida) y tocá el link que te mandamos.'
  }
  if (/failed to fetch|network|abort/.test(texto)) {
    return 'No hay conexión. Revisá la señal y probá de nuevo.'
  }
  return 'Email o contraseña incorrectos.'
}
