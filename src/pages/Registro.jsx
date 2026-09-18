import { Link } from 'react-router-dom'

// Pantalla de registro: acá va a ir el formulario completo (nombre y
// apellido, fecha de nacimiento, peso, celular, email, objetivo,
// "Lesiones y/o limitaciones" y elección de plan) que está detallado
// en el plan del proyecto. Por ahora es un cartel de "en construcción"
// para que el link "Registrarme" del login tenga a dónde ir.
export default function Registro() {
  return (
    <main className="auth-screen">
      <h1 className="auth-logo">DREY</h1>
      <p>Pantalla de registro — en construcción.</p>
      <Link to="/" className="auth-switch">
        Volver a iniciar sesión
      </Link>
    </main>
  )
}
