import { useEffect, useState } from 'react'
import {
  EVENTO_COLA,
  enviarPendientes,
  entrenamientosPendientes,
  entrenamientosTrabados,
} from '../services/colaEntrenamientos.js'
import { mostrarAviso } from '../services/avisos.js'

// Franja chica arriba de la pantalla que avisa:
//   · "Sin señal": la app sigue andando con lo guardado en el celular.
//   · "Enviando N entrenamientos…": guardados en el celular, se mandan
//     solos.
//   · "N entrenamientos sin enviar · Reintentar": la base no los tomó
//     (no por falta de señal). Siguen guardados en el celular; el botón
//     los vuelve a mandar.
// Cuando todo está bien no se ve nada. Montado una sola vez en App.
export default function EstadoConexion() {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine !== false)
  const [pendientes, setPendientes] = useState(() => entrenamientosPendientes().length)
  const [trabados, setTrabados] = useState(() => entrenamientosTrabados().length)
  const [reintentando, setReintentando] = useState(false)

  useEffect(() => {
    const conSenal = () => setEnLinea(true)
    const sinSenal = () => setEnLinea(false)
    const cambioCola = (evento) => {
      setPendientes(evento.detail?.cantidad ?? 0)
      setTrabados(entrenamientosTrabados().length)
    }
    window.addEventListener('online', conSenal)
    window.addEventListener('offline', sinSenal)
    window.addEventListener(EVENTO_COLA, cambioCola)
    return () => {
      window.removeEventListener('online', conSenal)
      window.removeEventListener('offline', sinSenal)
      window.removeEventListener(EVENTO_COLA, cambioCola)
    }
  }, [])

  async function reintentar() {
    setReintentando(true)
    const enviados = await enviarPendientes()
    setReintentando(false)
    if (enviados > 0) {
      mostrarAviso(
        enviados === 1 ? 'Entrenamiento enviado a tu profe' : `${enviados} entrenamientos enviados`,
      )
    } else {
      mostrarAviso('Todavía no se pudo enviar. Avisale a tu profe.', 'error')
    }
  }

  if (enLinea && pendientes === 0) return null

  const cantidad = (numero) => `${numero} ${numero === 1 ? 'entrenamiento' : 'entrenamientos'}`

  if (!enLinea) {
    return (
      <div className="estado-conexion sin-senal" role="status">
        {`Sin señal · la app sigue funcionando${pendientes > 0 ? ` · ${cantidad(pendientes)} por enviar` : ''}`}
      </div>
    )
  }

  if (trabados > 0) {
    return (
      <div className="estado-conexion con-problema" role="alert">
        <span>{`${cantidad(trabados)} sin enviar (está guardado en tu celular)`}</span>
        <button
          type="button"
          className="estado-conexion-boton"
          onClick={reintentar}
          disabled={reintentando}
        >
          {reintentando ? 'Enviando…' : 'Reintentar'}
        </button>
      </div>
    )
  }

  return (
    <div className="estado-conexion" role="status">
      {`Enviando ${cantidad(pendientes)}…`}
    </div>
  )
}
