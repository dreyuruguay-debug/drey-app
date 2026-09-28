import { cargarConfiguracion } from './configuracion.js'
import { listaDePlanes } from '../data/planes.js'

// Planes con los precios de la base de datos (tabla "planes", ver
// supabase/sql/014 y 022). Esa tabla es la que usa Mercado Pago para
// cobrar, así que la app muestra siempre lo mismo que se cobra. Los
// cambia el Admin desde Ajustes.
//
// Por defecto devuelve solo los que se ofrecen al registrarse; con
// incluirOcultos, todos (para cuentas y estadísticas). Sin señal, los
// últimos conocidos.
export async function cargarPlanesConPrecios({ incluirOcultos = false } = {}) {
  await cargarConfiguracion()
  return listaDePlanes({ soloVisibles: !incluirOcultos })
}
