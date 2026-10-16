import { useEffect, useState } from 'react'
import { mostrarAviso } from '../services/avisos.js'
import { cargarRecordatorio, guardarRecordatorio } from '../services/avisosAlumno.js'

// "Recordatorio para entrenar" del Perfil del alumno: a qué hora le llega
// "Hoy te toca…" los días que tiene rutina. Puede elegir su hora o dejar
// la de DREY (la que eligió el Admin en Ajustes → Notificaciones).
// Supabase/sql/030: perfiles.hora_recordatorio.
//
// No aparece si el Admin apagó esa notificación o si no se pudo leer
// (sin señal o SQL 030 sin instalar).
export default function RecordatorioEntreno() {
  const [datos, setDatos] = useState(null)
  const [hora, setHora] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    cargarRecordatorio().then((resultado) => {
      setDatos(resultado)
      setHora(resultado?.propia || resultado?.general || '')
    })
  }, [])

  if (!datos?.activo) return null

  const propia = Boolean(datos.propia)
  const cambiado = hora && hora !== (datos.propia || datos.general)

  async function guardar(nueva) {
    setGuardando(true)
    const error = await guardarRecordatorio(nueva)
    setGuardando(false)
    if (error) {
      mostrarAviso('No pudimos guardar la hora. Probá de nuevo con señal.', 'error')
      return
    }
    setDatos((actual) => ({ ...actual, propia: nueva }))
    setHora(nueva || datos.general)
    mostrarAviso(nueva ? `Te vamos a avisar a las ${nueva}` : 'Listo: a la hora de DREY')
  }

  return (
    <div className="tarjeta-rutina recordatorio-entreno">
      <span className="tarjeta-rutina-textos">
        <strong>Recordatorio para entrenar</strong>
        <small>
          Los días que tenés rutina te avisamos "Hoy te toca…".{' '}
          {propia ? 'Elegiste tu hora.' : `Hora de DREY: ${datos.general}.`}
        </small>
        {propia && (
          <button
            type="button"
            className="boton-texto-plano recordatorio-entreno-volver"
            disabled={guardando}
            onClick={() => guardar(null)}
          >
            Volver a la hora de DREY ({datos.general})
          </button>
        )}
      </span>
      <span className="recordatorio-entreno-hora">
        <input
          type="time"
          step="900"
          className="auth-input"
          aria-label="Hora del recordatorio"
          value={hora}
          onChange={(event) => setHora(event.target.value)}
        />
        {cambiado && (
          <button
            type="button"
            className="boton-principal boton-chico"
            disabled={guardando}
            onClick={() => guardar(hora)}
          >
            {guardando ? '…' : 'Guardar'}
          </button>
        )}
      </span>
    </div>
  )
}
