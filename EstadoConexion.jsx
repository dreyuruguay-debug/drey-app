import { useEffect, useState } from 'react'
import { EVENTO_COLA, entrenamientosPendientes } from '../services/colaEntrenamientos.js'

// Franja chica arriba de la pantalla que avisa:
//   · "Sin señal": la app sigue andando con lo guardado en el celular.
//   · "N entrenamientos por enviar": guardados sin señal, se mandan solos.
// Cuando todo está bien no se ve nada. Montado una sola vez en App.
export default function EstadoConexion() {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine !== false)
  const [pendientes, setPendientes] = useState(() => entrenamientosPendientes().length)

  useEffect(() => {
    const conSenal = () => setEnLinea(true)
    const sinSenal = () => setEnLinea(false)
    const cambioCola = (evento) => setPendientes(evento.detail?.cantidad ?? 0)
    window.addEventListener('online', conSenal)
    window.addEventListener('offline', sinSenal)
    window.addEventListener(EVENTO_COLA, cambioCola)
    return () => {
      window.removeEventListener('online', conSenal)
      window.removeEventListener('offline', sinSenal)
      window.removeEventListener(EVENTO_COLA, cambioCola)
    }
  }, [])

  if (enLinea && pendientes === 0) return null

  const porEnviar =
    pendientes > 0
      ? `${pendientes} ${pendientes === 1 ? 'entrenamiento' : 'entrenamientos'} por enviar`
      : ''

  return (
    <div className={enLinea ? 'estado-conexion' : 'estado-conexion sin-senal'} role="status">
      {enLinea
        ? `Enviando ${porEnviar}…`
        : `Sin señal · la app sigue funcionando${porEnviar ? ` · ${porEnviar}` : ''}`}
    </div>
  )
}
