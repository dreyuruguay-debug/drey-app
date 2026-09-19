import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import EyeIcon from '../components/EyeIcon.jsx'
import { PLANES, formatearPrecio } from '../data/planes.js'
import { calcularEdad } from '../utils/fechas.js'

// Pantalla de registro. El cliente crea su propio usuario con todos los
// datos que pide el plan del proyecto y elige uno de los 3 planes. La
// cuenta queda "pendiente" hasta que el profe confirme el pago y la
// habilite (ese panel del profe todavía no está construido).
//
// Los datos que no son de login (nombre, fecha de nacimiento, peso,
// celular, objetivo, lesiones, plan, código de descuento) se guardan
// por ahora en los metadatos del usuario de Supabase. Cuando
// construyamos el panel del profe y la tabla de clientes, este mismo
// formulario va a mandar esos datos ahí en vez de a los metadatos.
export default function Registro() {
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmarPassword, setShowConfirmarPassword] = useState(false)
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [peso, setPeso] = useState('')
  const [celular, setCelular] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [lesiones, setLesiones] = useState('')
  const [planId, setPlanId] = useState('')
  const [codigoDescuento, setCodigoDescuento] = useState('')
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false)

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [registrado, setRegistrado] = useState(false)

  const edad = calcularEdad(fechaNacimiento)

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')

    if (
      !nombre ||
      !apellido ||
      !email ||
      !password ||
      !fechaNacimiento ||
      !celular ||
      !objetivo ||
      !planId
    ) {
      setMessage('Completá todos los campos obligatorios.')
      return
    }
    if (password !== confirmarPassword) {
      setMessage('Las contraseñas no coinciden.')
      return
    }
    if (!aceptaPrivacidad) {
      setMessage('Tenés que aceptar la política de privacidad para continuar.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre,
          apellido,
          fecha_nacimiento: fechaNacimiento,
          peso: peso ? Number(peso) : null,
          celular,
          objetivo,
          lesiones: lesiones || null,
          plan: planId,
          codigo_descuento: codigoDescuento || null,
          estado: 'pendiente',
        },
      },
    })
    setLoading(false)

    if (error) {
      setMessage(
        error.message.includes('already registered')
          ? 'Ese email ya tiene una cuenta creada.'
          : 'No pudimos crear la cuenta. Probá de nuevo.'
      )
      return
    }

    setRegistrado(true)
  }

  if (registrado) {
    return (
      <main className="auth-screen">
        <img src="/drey-logo.png" alt="DREY" className="auth-logo-img" />
        <p className="registro-gracias-titulo">¡Cuenta creada!</p>
        <p className="registro-gracias-texto">
          Tu cuenta queda pendiente hasta que confirmemos el pago y la habilitemos. Te
          avisamos por email apenas esté lista.
        </p>
        <Link to="/" className="pill-button registro-gracias-boton">
          Volver a iniciar sesión
        </Link>
      </main>
    )
  }

  return (
    <main className="registro-screen">
      <img src="/drey-logo.png" alt="DREY" className="auth-logo-img" />

      <form className="registro-form" onSubmit={handleSubmit}>
        <p className="form-section-label">Tus datos</p>

        <div className="form-row">
          <input
            className="auth-input"
            type="text"
            placeholder="Nombre"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            required
          />
          <input
            className="auth-input"
            type="text"
            placeholder="Apellido"
            value={apellido}
            onChange={(event) => setApellido(event.target.value)}
            required
          />
        </div>

        <div>
          <input
            className="auth-input"
            type="date"
            value={fechaNacimiento}
            onChange={(event) => setFechaNacimiento(event.target.value)}
            required
            aria-label="Fecha de nacimiento"
          />
          {edad !== null && <p className="registro-edad">Edad: {edad} años</p>}
        </div>

        <div className="form-row">
          <input
            className="auth-input"
            type="number"
            step="0.1"
            placeholder="Peso en kg (opcional)"
            value={peso}
            onChange={(event) => setPeso(event.target.value)}
          />
          <input
            className="auth-input"
            type="tel"
            placeholder="Celular"
            value={celular}
            onChange={(event) => setCelular(event.target.value)}
            required
          />
        </div>

        <input
          className="auth-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <div className="auth-input-wrap">
          <input
            className="auth-input"
            type={showPassword ? 'text' : 'password'}
            placeholder="Contraseña"
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

        <div className="auth-input-wrap">
          <input
            className="auth-input"
            type={showConfirmarPassword ? 'text' : 'password'}
            placeholder="Repetir contraseña"
            value={confirmarPassword}
            onChange={(event) => setConfirmarPassword(event.target.value)}
            required
          />
          <button
            type="button"
            className="auth-eye-btn"
            onClick={() => setShowConfirmarPassword((value) => !value)}
            aria-label={showConfirmarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <EyeIcon crossed={showConfirmarPassword} />
          </button>
        </div>

        <p className="form-section-label">Tu entrenamiento</p>

        <input
          className="auth-input"
          type="text"
          placeholder="Objetivo (por ejemplo: Recomposición corporal)"
          value={objetivo}
          onChange={(event) => setObjetivo(event.target.value)}
          required
        />

        <textarea
          className="form-textarea"
          placeholder="Lesiones y/o limitaciones (opcional)"
          value={lesiones}
          onChange={(event) => setLesiones(event.target.value)}
        />

        <p className="form-section-label">Elegí tu plan</p>

        <div className="plan-opciones">
          {PLANES.map((plan) => (
            <button
              key={plan.id}
              type="button"
              className={plan.id === planId ? 'plan-card plan-card-activo' : 'plan-card'}
              onClick={() => setPlanId(plan.id)}
            >
              <span className="plan-card-nombre">{plan.nombre}</span>
              <span className="plan-card-descripcion">{plan.descripcion}</span>
              <span className="plan-card-precio">
                {formatearPrecio(plan.precioPrimerMes)} el primer mes
              </span>
              <span className="plan-card-precio-siguiente">
                Desde el 2.º mes: {formatearPrecio(plan.precioDesdeSegundoMes)}
              </span>
            </button>
          ))}
        </div>

        <input
          className="auth-input"
          type="text"
          placeholder="Código de descuento (opcional)"
          value={codigoDescuento}
          onChange={(event) => setCodigoDescuento(event.target.value)}
        />

        <label className="form-checkbox-row">
          <input
            type="checkbox"
            checked={aceptaPrivacidad}
            onChange={(event) => setAceptaPrivacidad(event.target.checked)}
          />
          <span>
            Acepto la política de privacidad (Ley 18.331 de protección de datos personales).
          </span>
        </label>

        {message && <p className="auth-message">{message}</p>}

        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>

      <Link to="/" className="auth-switch">
        Ya tengo cuenta
      </Link>
    </main>
  )
}
