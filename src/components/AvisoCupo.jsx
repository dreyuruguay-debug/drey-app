import { Link } from 'react-router-dom'
import { esDuenoDe, espacioActivo } from '../services/espacio.js'

// Cuando la base no deja habilitar a un alumno (supabase/sql/032): cupo
// lleno, la suscripción DREY no está al día, o en ese gimnasio habilita
// el dueño. Explica qué pasó y qué hacer:
//   · el dueño del espacio (en el suyo, el profe) va a "Suscripción DREY"
//     para cambiar de plan o pagar;
//   · un profe de gimnasio tiene que hablar con el dueño.
// problema: lo que devuelve problemaDeCupo() de utils/cupos.js.
export default function AvisoCupo({ problema, onCerrar }) {
  if (!problema) return null
  const espacio = espacioActivo()
  const puedeResolver = esDuenoDe(espacio) && problema.motivo !== 'permiso'
  return (
    <div className="aviso-baja" role="alert">
      <strong>
        {problema.motivo === 'permiso' ? 'No podés habilitarlo' : 'No se pudo habilitar'}
      </strong>
      <span>{problema.texto}</span>
      {!puedeResolver && problema.motivo !== 'permiso' && espacio?.tipo === 'gimnasio' && (
        <span>Hablá con el dueño del gimnasio para que sume lugares.</span>
      )}
      <div className="equipo-confirmar">
        {puedeResolver && (
          <Link to="/profe/suscripcion" className="boton-principal boton-chico">
            Ver Suscripción DREY
          </Link>
        )}
        {onCerrar && (
          <button type="button" className="boton-secundario boton-chico" onClick={onCerrar}>
            Entendido
          </button>
        )}
      </div>
    </div>
  )
}
