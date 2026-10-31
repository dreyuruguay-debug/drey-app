import { useState } from 'react'
import EyeIcon from '../EyeIcon.jsx'

// "Tus datos": lo que piden los tres registros (alumno, profe y
// gimnasio): nombre, apellido, celular, email y contraseña. Cada registro
// suma después sus propios pasos (pages/Registro.jsx y
// pages/RegistroProfe.jsx).
//
//   datos: { nombre, apellido, celular, email, password, confirmarPassword }
//   onCambiar(campo, valor)
//   sinCelular: el alumno pide el celular más abajo, junto al peso.
export const DATOS_VACIOS = Object.freeze({
  nombre: '',
  apellido: '',
  celular: '',
  email: '',
  password: '',
  confirmarPassword: '',
})

export default function DatosDeCuenta({ datos, onCambiar, sinCelular = false }) {
  const [verPassword, setVerPassword] = useState(false)
  const [verConfirmar, setVerConfirmar] = useState(false)

  return (
    <>
      <div className="form-row">
        <input
          className="auth-input"
          type="text"
          placeholder="Nombre"
          autoComplete="given-name"
          value={datos.nombre}
          onChange={(event) => onCambiar('nombre', event.target.value)}
        />
        <input
          className="auth-input"
          type="text"
          placeholder="Apellido"
          autoComplete="family-name"
          value={datos.apellido}
          onChange={(event) => onCambiar('apellido', event.target.value)}
        />
      </div>

      {!sinCelular && (
        <input
          className="auth-input"
          type="tel"
          placeholder="Celular"
          autoComplete="tel"
          value={datos.celular}
          onChange={(event) => onCambiar('celular', event.target.value)}
        />
      )}

      <input
        className="auth-input"
        type="email"
        placeholder="Email"
        autoComplete="email"
        value={datos.email}
        onChange={(event) => onCambiar('email', event.target.value)}
      />

      <div className="auth-input-wrap">
        <input
          className="auth-input"
          type={verPassword ? 'text' : 'password'}
          placeholder="Contraseña"
          autoComplete="new-password"
          value={datos.password}
          onChange={(event) => onCambiar('password', event.target.value)}
        />
        <button
          type="button"
          className="auth-eye-btn"
          onClick={() => setVerPassword((valor) => !valor)}
          aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          <EyeIcon crossed={verPassword} />
        </button>
      </div>

      <div className="auth-input-wrap">
        <input
          className="auth-input"
          type={verConfirmar ? 'text' : 'password'}
          placeholder="Repetir contraseña"
          autoComplete="new-password"
          value={datos.confirmarPassword}
          onChange={(event) => onCambiar('confirmarPassword', event.target.value)}
        />
        <button
          type="button"
          className="auth-eye-btn"
          onClick={() => setVerConfirmar((valor) => !valor)}
          aria-label={verConfirmar ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          <EyeIcon crossed={verConfirmar} />
        </button>
      </div>
    </>
  )
}

// Devuelve el problema a corregir, o '' si está todo bien.
export function revisarDatosDeCuenta(datos) {
  if (!datos.nombre.trim() || !datos.apellido.trim() || !datos.email.trim() || !datos.password) {
    return 'Completá todos los campos obligatorios.'
  }
  if (!datos.celular.trim()) return 'Poné tu celular.'
  if (!/^\S+@\S+\.\S+$/.test(datos.email.trim())) return 'Revisá el email: parece que tiene un error.'
  if (datos.password.length < 6) return 'La contraseña tiene que tener al menos 6 caracteres.'
  if (datos.password !== datos.confirmarPassword) return 'Las contraseñas no coinciden.'
  return ''
}

// Texto para el error de Supabase al crear la cuenta.
export function textoErrorRegistro(error) {
  return error?.message?.includes('already registered')
    ? 'Ese email ya tiene una cuenta creada.'
    : 'No pudimos crear la cuenta. Probá de nuevo.'
}
