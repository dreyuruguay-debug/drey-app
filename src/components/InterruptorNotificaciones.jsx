import { useEffect, useState } from 'react'
import {
  activarNotificaciones,
  desactivarNotificaciones,
  estadoNotificaciones,
} from '../services/notificaciones.js'
import { mostrarAviso } from '../services/avisos.js'
import GuiaInstalacion from './instalar/GuiaInstalacion.jsx'

// Tarjeta para prender o apagar las notificaciones en ESTE celular. La
// usan el Perfil del alumno y el Inicio del profe.
//
// "textoActivar": qué avisos va a recibir (distinto para alumno y profe).
//
// En un iPhone sin DREY instalada los avisos no pueden llegar: tocar la
// tarjeta abre la guía para instalarla (instalar/GuiaInstalacion.jsx).
export default function InterruptorNotificaciones({ textoActivar }) {
  const [estado, setEstado] = useState('cargando')
  const [ocupado, setOcupado] = useState(false)
  const [guiaAbierta, setGuiaAbierta] = useState(false)

  useEffect(() => {
    estadoNotificaciones().then(setEstado)
  }, [])

  async function alternar() {
    setOcupado(true)
    const resultado =
      estado === 'activado' ? await desactivarNotificaciones() : await activarNotificaciones()
    setOcupado(false)
    if (resultado?.error) {
      mostrarAviso(resultado.error, 'error')
      return
    }
    setEstado(resultado)
    if (resultado === 'activado') mostrarAviso('Notificaciones activadas')
  }

  if (estado === 'cargando' || estado === 'no-soportado') return null

  const textos = {
    activado: ['Notificaciones activadas', 'Tocá para dejar de recibirlas en este celular.'],
    desactivado: ['Activar notificaciones', textoActivar],
    bloqueado: [
      'Notificaciones bloqueadas',
      'Las bloqueaste en este celular. Para activarlas: ajustes del navegador → Notificaciones → permitir para esta página.',
    ],
    'instalar-primero': [
      'Notificaciones',
      'En iPhone llegan solo con DREY instalada. Tocá acá para ver cómo instalarla.',
    ],
  }
  const [titulo, detalle] = textos[estado]
  const sePuedeTocar = estado === 'activado' || estado === 'desactivado'
  const faltaInstalar = estado === 'instalar-primero'

  if (faltaInstalar) {
    return (
      <>
        <button
          type="button"
          className="tarjeta-rutina notificaciones-tarjeta"
          onClick={() => setGuiaAbierta(true)}
        >
          <span className="tarjeta-rutina-textos">
            <strong>{titulo}</strong>
            <small>{detalle}</small>
          </span>
          <span className="tarjeta-flecha" aria-hidden="true">
            ›
          </span>
        </button>
        <GuiaInstalacion abierta={guiaAbierta} onCerrar={() => setGuiaAbierta(false)} />
      </>
    )
  }

  return (
    <button
      type="button"
      className="tarjeta-rutina notificaciones-tarjeta"
      onClick={sePuedeTocar ? alternar : undefined}
      disabled={!sePuedeTocar || ocupado}
    >
      <span className="tarjeta-rutina-textos">
        <strong>{ocupado ? 'Un momento…' : titulo}</strong>
        <small>{detalle}</small>
      </span>
      {sePuedeTocar && (
        <span
          className={estado === 'activado' ? 'interruptor interruptor-on' : 'interruptor'}
          aria-hidden="true"
        />
      )}
    </button>
  )
}
