import { obtenerMetodo, linkBusquedaGoogle } from '../data/metodos.js'
import Ayuda from './Ayuda.jsx'

// Botón ⓘ con la explicación de un método de entrenamiento (y un enlace
// para buscarlo en Google). Lo usan el editor del profe y la rutina del
// cliente.
export default function InfoMetodo({ metodoId }) {
  const metodo = obtenerMetodo(metodoId)
  return (
    <Ayuda titulo={metodo.nombre} texto={metodo.explicacion} enlace={linkBusquedaGoogle(metodo)} />
  )
}
