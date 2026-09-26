import { configuracion } from './configuracion.js'

// Planes de DREY. Los vigentes (nombre, descripción, precios, link de
// Mercado Pago, visible o no) los maneja el Admin desde Ajustes y viven
// en la tabla "planes" (supabase/sql/014 y 022). Esta lista es solo el
// respaldo mientras la app todavía no los trajo de la base.
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
// Con soloVisibles, solo los que se ofrecen al registrarse.
export function listaDePlanes({ soloVisibles = false } = {}) {
  const lista = configuracion().planes || PLANES
  return soloVisibles ? lista.filter((plan) => plan.activo !== false) : lista
}

export function obtenerPlan(id) {
  return listaDePlanes().find((plan) => plan.id === id)
}
