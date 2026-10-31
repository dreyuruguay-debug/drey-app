import { Link, Navigate, useSearchParams } from 'react-router-dom'
import LogoDrey from '../components/LogoDrey.jsx'
import { RUTA_INGRESAR } from '../data/rutas.js'

// "/registro": ¿qué cuenta querés crear? (supabase/sql/033)
//   · Soy alumno        → /registro/alumno (pages/Registro.jsx)
//   · Soy profe         → /registro/profe (pages/RegistroProfe.jsx)
//   · Tengo un gimnasio → /registro/gimnasio (el mismo, para gimnasios)
// Los links viejos "/registro?plan=…" (un plan de alumno) y los nuevos
// "/registro?espacio=CODIGO" (el link de un profe o gimnasio) van directo
// al registro del alumno, con lo que traían.
const OPCIONES = [
  {
    to: '/registro/alumno',
    titulo: 'Soy alumno',
    texto: 'Quiero entrenar con mi profe o mi gimnasio.',
  },
  {
    to: '/registro/profe',
    titulo: 'Soy profe',
    texto: 'Quiero manejar a mis alumnos, sus rutinas y sus cobros.',
  },
  {
    to: '/registro/gimnasio',
    titulo: 'Tengo un gimnasio',
    texto: 'Quiero sumar a mis profes y a todos los alumnos del gimnasio.',
  },
]

export default function RegistroElegir() {
  const [parametros] = useSearchParams()
  if (parametros.get('plan') || parametros.get('espacio')) {
    return <Navigate to={`/registro/alumno?${parametros.toString()}`} replace />
  }

  return (
    <main className="registro-screen">
      <LogoDrey />
      <p className="form-section-label registro-elegir-titulo">¿Qué cuenta querés crear?</p>
      <nav className="plan-opciones" aria-label="Tipo de cuenta">
        {OPCIONES.map((opcion) => (
          <Link key={opcion.to} to={opcion.to} className="plan-card">
            <span className="plan-card-nombre">{opcion.titulo}</span>
            <span className="plan-card-descripcion">{opcion.texto}</span>
          </Link>
        ))}
      </nav>
      <Link to={RUTA_INGRESAR} className="auth-switch">
        Ya tengo cuenta
      </Link>
    </main>
  )
}
