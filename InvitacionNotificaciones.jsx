import { useEffect, useState } from 'react'
import { activarNotificaciones, estadoNotificaciones } from '../services/notificaciones.js'
import { guardarJSON, leerJSON } from '../utils/almacenLocal.js'
import { mostrarAviso } from '../services/avisos.js'

// Tarjeta en el Inicio del alumno invitando a activar las notificaciones
// ("Hoy te toca…", rutina nueva, vencimiento). Aparece hasta que las
// activa o toca "Ahora no" (se recuerda en este celular).
export default function InvitacionNotificaciones({ usuarioId }) {
  const clave = `drey-invitacion-avisos-${usuarioId}`
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (leerJSON(clave)) return
    estadoNotificaciones().then((estado) => setVisible(estado === 'desactivado'))
  }, [clave])

  if (!visible) return null

  async function activar() {
    const resultado = await activarNotificaciones()
    if (resultado?.error) {
      mostrarAviso(resultado.error, 'error')
      return
    }
    if (resultado === 'activado') mostrarAviso('Notificaciones activadas')
    cerrar()
  }

  function cerrar() {
    guardarJSON(clave, true)
    setVisible(false)
  }

  return (
    <div className="invitacion-avisos">
      <p>
        <strong>¿Te avisamos?</strong> Te mandamos un aviso el día que te toca entrenar, cuando tu
        profe te arma una rutina y antes de que venza tu plan.
      </p>
      <div className="invitacion-avisos-botones">
        <button type="button" className="boton-principal boton-chico" onClick={activar}>
          Activar avisos
        </button>
        <button type="button" className="boton-texto" onClick={cerrar}>
          Ahora no
        </button>
      </div>
    </div>
  )
}
