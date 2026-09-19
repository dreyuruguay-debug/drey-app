import TopPattern from './TopPattern.jsx'
import ProfileIcon from './ProfileIcon.jsx'

// Encabezado que comparten las pantallas del cliente (Inicio, Rutinas):
// franja DREY arriba, objetivo a la izquierda, foto/nombre/plan al
// centro y la cantidad de días de entrenamiento semanales a la derecha.
//
// diasEntrenamiento es la cantidad de días con rutina asignada en el
// calendario semanal de ese cliente, armado por el profe desde su panel.
export default function ClienteHeader({ objetivo, nombre, plan, diasEntrenamiento, onLogout }) {
  return (
    <>
      <TopPattern />

      <button type="button" className="header-logout" onClick={onLogout}>
        Cerrar sesión
      </button>

      <div className="cliente-header">
        <div className="cliente-header-col">
          <p className="cliente-header-goal">Objetivo: {objetivo || 'Sin definir'}</p>
        </div>

        <div className="cliente-header-col cliente-header-center">
          <ProfileIcon />
          <p className="cliente-header-name">{nombre}</p>
          <p className="cliente-header-plan">{plan}</p>
        </div>

        <div className="cliente-header-col cliente-header-right">
          <p className="cliente-header-progress-label">
            {diasEntrenamiento} días de entrenamiento por semana
          </p>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(diasEntrenamiento / 7) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
