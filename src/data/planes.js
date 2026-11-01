import { configuracion } from './configuracion.js'

// Planes para alumnos. Cada profe o gimnasio (espacio) tiene los suyos
// (nombre, descripción, precios, link de Mercado Pago, visible o no): los
// maneja su dueño desde Cobros y viven en la tabla "planes" (supabase/sql/
// 014, 022 y 034). Esta lista es solo el respaldo mientras la app todavía
// no los trajo de la base.
export const PLANES = [
  {
    id: 'seguimiento',
    nombre: 'Plan seguimiento',
    descripcion: 'Rutina a medida y seguimiento presencial',
    precioPrimerMes: 5000,
    precioDesdeSegundoMes: 4000,
  },
  {
    id: 'seguimiento-online',
    nombre: 'Plan seguimiento online',
    descripcion: 'Rutina y seguimiento solo online; una visita al mes si se puede',
    precioPrimerMes: 3000,
    precioDesdeSegundoMes: 1500,
  },
  {
    id: 'rutina',
    nombre: 'Plan rutina',
    descripcion: 'Solo la rutina: entrenás por tu cuenta',
    precioPrimerMes: 1500,
    precioDesdeSegundoMes: 500,
  },
]

export function formatearPrecio(valor) {
  return `$U ${valor.toLocaleString('es-UY')}`
}

// Todos los planes (también los ocultos: hay clientes que los tienen).
// Con soloVisibles, solo los que se ofrecen al registrarse. Con espacioId,
// solo los de ese profe o gimnasio.
export function listaDePlanes({ soloVisibles = false, espacioId = null } = {}) {
  const lista = configuracion().planes || PLANES
  return lista.filter(
    (plan) =>
      (!soloVisibles || plan.activo !== false) && (!espacioId || plan.espacioId === espacioId),
  )
}

export function obtenerPlan(id) {
  return listaDePlanes().find((plan) => plan.id === id)
}
