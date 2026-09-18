import TopPattern from './TopPattern.jsx'
import ProfileIcon from './ProfileIcon.jsx'

// Encabezado que comparten las pantallas del cliente (Inicio, Rutinas):
// franja DREY arriba, semana/objetivo a la izquierda, foto/nombre/plan
// al centro y la barra de progreso semanal a la derecha.
//
// diasPosibles debería ser la cantidad de días con rutina asignada en el
// calendario semanal de ese cliente (lo arma el profe) — por ahora se
// pasa como número fijo hasta conectar esa parte del panel del profe.
export default function ClienteHeader({
  semana,
  objetivo,
  nombre,
  plan,
  diasCumplidos,
  diasPosibles,
  onLogout,
}) {
  return (
    <>
      <TopPattern />

      <button type="button" className="header-logout" onClick={onLogout}>
        Cerrar sesión
      </button>

      <div className="cliente-header">
        <div className="cliente-header-col">
          <p className="cliente-header-week">Semana {semana}</p>
          <p className="cliente-header-goal">Objetivo: {objetivo}</p>
        </div>

        <div className="cliente-header-col cliente-header-center">
          <ProfileIcon />
          <p className="cliente-header-name">{nombre}</p>
          <p className="cliente-header-plan">{plan}</p>
        </div>

        <div className="cliente-header-col cliente-header-right">
          <p className="cliente-header-progress-label">
            {diasCumplidos} días de {diasPosibles} posibles
          </p>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(diasCumplidos / diasPosibles) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
