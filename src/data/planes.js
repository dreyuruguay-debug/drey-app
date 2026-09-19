// Los tres planes de DREY (ver "Planes y acceso" en el plan del
// proyecto). Viven en un solo lugar para que Registro y Suscripción
// muestren siempre los mismos datos.
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

export function obtenerPlan(id) {
  return PLANES.find((plan) => plan.id === id)
}
