import { useEffect, useState } from 'react'
import { activarNotificaciones, estadoNotificaciones } from '../../services/notificaciones.js'
import { mostrarAviso } from '../../services/avisos.js'
import GuiaInstalacion from '../instalar/GuiaInstalacion.jsx'

// Interruptor "Avisarme al terminar" de la pantalla de descanso
// (PantallaDescanso.jsx). Prendido: si sale de DREY mientras descansa, le
// llega una notificación cuando termina (ver useAvisoDeDescanso.js).
//
// Si en este celular las notificaciones no están activadas, lo dice y
// ofrece activarlas (o, en un iPhone sin DREY instalada, cómo instalarla).
//
//   prendido / onCambiar: el valor del interruptor (se recuerda en el
//   celular, ver services/avisosAlumno.js).
export default function InterruptorAvisoDescanso({ prendido, onCambiar }) {
  const [estado, setEstado] = useState('cargando')
  const [guiaAbierta, setGuiaAbierta] = useState(false)

  useEffect(() => {
    estadoNotificaciones().then(setEstado)
  }, [])

  if (estado === 'cargando' || estado === 'no-soportado') return null

  async function activar() {
    const resultado = await activarNotificaciones()
    if (resultado?.error) {
      mostrarAviso(resultado.error, 'error')
      return
    }
    setEstado(resultado)
    if (resultado === 'activado') mostrarAviso('Notificaciones activadas')
  }

  const faltaActivar = prendido && estado !== 'activado'

  return (
    <div className="descanso-aviso-fin">
      <button
        type="button"
        className="descanso-aviso-fin-fila"
        role="switch"
        aria-checked={prendido}
        onClick={() => onCambiar(!prendido)}
      >
        <span className="descanso-aviso-fin-textos">
          <strong>🔔 Avisarme al terminar</strong>
          <small>Si salís de DREY, te llega una notificación cuando termina el descanso.</small>
        </span>
        <span
          className={prendido ? 'interruptor interruptor-on' : 'interruptor'}
          aria-hidden="true"
        />
      </button>

      {faltaActivar && estado === 'desactivado' && (
        <p className="descanso-aviso-fin-nota">
          Falta activar las notificaciones en este celular.{' '}
          <button type="button" className="boton-texto-plano" onClick={activar}>
            Activarlas
          </button>
        </p>
      )}
      {faltaActivar && estado === 'instalar-primero' && (
        <p className="descanso-aviso-fin-nota">
          En iPhone llega solo con DREY instalada.{' '}
          <button type="button" className="boton-texto-plano" onClick={() => setGuiaAbierta(true)}>
            Ver cómo
          </button>
        </p>
      )}
      {faltaActivar && estado === 'bloqueado' && (
        <p className="descanso-aviso-fin-nota">
          Las notificaciones están bloqueadas en este celular (ajustes del navegador →
          Notificaciones).
        </p>
      )}

      <GuiaInstalacion abierta={guiaAbierta} onCerrar={() => setGuiaAbierta(false)} />
    </div>
  )
}
