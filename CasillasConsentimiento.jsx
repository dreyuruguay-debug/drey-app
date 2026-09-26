import { Link } from 'react-router-dom'

// Las dos casillas de consentimiento (Ley 18.331): una para aceptar los
// términos y la política de privacidad, y otra, aparte, para los datos
// de salud (la ley pide consentimiento expreso para datos sensibles).
// Las usan el Registro y la pantalla que ven las cuentas que ya existían.
//
// Los links abren en otra pestaña para no perder lo que ya se completó.
export default function CasillasConsentimiento({ terminos, salud, onTerminos, onSalud }) {
  return (
    <div className="consentimiento">
      <label className="form-checkbox-row">
        <input
          type="checkbox"
          checked={terminos}
          onChange={(event) => onTerminos(event.target.checked)}
        />
        <span>
          Leí y acepto los{' '}
          <Link to="/terminos" target="_blank" rel="noopener">
            términos y condiciones
          </Link>{' '}
          y la{' '}
          <Link to="/privacidad" target="_blank" rel="noopener">
            política de privacidad
          </Link>
          .
        </span>
      </label>
      <label className="form-checkbox-row">
        <input type="checkbox" checked={salud} onChange={(event) => onSalud(event.target.checked)} />
        <span>
          Autorizo a DREY y a mi profe a usar mis datos de salud (lesiones, peso, fecha de
          nacimiento) solo para armar y seguir mi entrenamiento.
        </span>
      </label>
    </div>
  )
}
