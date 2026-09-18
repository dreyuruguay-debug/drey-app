import { Link } from 'react-router-dom'

// Tarjeta de una rutina (Rutina A, B, C...) en la lista de Rutinas.
// "patron" y "musculos" los carga el profe al armar la rutina.
export default function RutinaCard({ id, nombre, patron, musculos }) {
  return (
    <Link to={`/rutinas/${id}`} className="rutina-card">
      <div className="rutina-card-title">{nombre}</div>
      <div className="rutina-card-body">
        <p className="rutina-card-patron">{patron}</p>
        <p className="rutina-card-musculos">{musculos}</p>
      </div>
    </Link>
  )
}
