// Ícono de "ojo" simple, sin depender de ninguna librería de íconos.
// Se usa para mostrar/ocultar contraseñas en Login y Registro.
export default function EyeIcon({ crossed }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <line x1="2" y1="22" x2="22" y2="2" />}
    </svg>
  )
}
