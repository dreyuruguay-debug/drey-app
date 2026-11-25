import { estadoDelPlan } from '../data/vencimiento.js'

// Cálculos de la lista de alumnos del panel (pages/ProfeClientes.jsx): en
// qué situación está cada uno, los filtros y el orden. No leen la base.

// A partir de esta cantidad de días sin entrenar, el alumno se marca en
// naranja ("no entrena") para que el profe lo note sin entrar a cada uno.
export const UMBRAL_DIAS_INACTIVO = 5

const CUOTA_VENCIDA = ['gracia', 'vencido']
const CUOTA_AL_DIA = ['al-dia', 'por-vencer']

export function cuotaVencida(cliente, hoy) {
  return CUOTA_VENCIDA.includes(estadoDelPlan(cliente, hoy).tipo)
}

export function noEntrena(cliente) {
  return cliente.diasSinEntrenar != null && cliente.diasSinEntrenar >= UMBRAL_DIAS_INACTIVO
}

// La situación de un alumno de un vistazo: el color del puntito y el
// texto corto. Lo más importante primero: la cuota vencida (solo si quien
// mira maneja los cobros), después si no viene a entrenar.
//   tono: 'ok' (verde) · 'atencion' (naranja) · 'alerta' (rojo)
export function situacionDelCliente(cliente, hoy, { veCuota = false } = {}) {
  const entreno = textoUltimoEntreno(cliente.diasSinEntrenar)
  if (veCuota && cuotaVencida(cliente, hoy)) {
    return { tono: 'alerta', texto: 'Cuota vencida', entreno }
  }
  if (noEntrena(cliente)) {
    return { tono: 'atencion', texto: `Sin entrenar hace ${cliente.diasSinEntrenar} días`, entreno }
  }
  return { tono: 'ok', texto: 'Al día', entreno }
}

export function textoUltimoEntreno(dias) {
  if (dias == null) return '—'
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  return `Hace ${dias} días`
}

export function iniciales(cliente) {
  return `${cliente?.nombre?.[0] || ''}${cliente?.apellido?.[0] || ''}`.toUpperCase() || '·'
}

// ---------- Filtros ----------
// Los chips de arriba de la lista. "veCuota": solo el Admin y el dueño
// del espacio ven los de la cuota.
export const FILTROS = [
  { id: '', label: 'Todos' },
  { id: 'no-entrenan', label: 'No entrenan' },
  { id: 'vencidos', label: 'Cuota vencida', soloCuota: true },
  { id: 'al-dia', label: 'Cuota al día', soloCuota: true },
]

export function cumpleFiltro(cliente, filtro, hoy) {
  if (filtro === 'no-entrenan') return noEntrena(cliente)
  if (filtro === 'vencidos') return cuotaVencida(cliente, hoy)
  if (filtro === 'al-dia') return CUOTA_AL_DIA.includes(estadoDelPlan(cliente, hoy).tipo)
  return true
}

//   texto:    lo escrito en el buscador.
//   filtro:   el chip elegido (FILTROS).
//   profe:    '' (todos), 'sin' (sin profe) o el id de un profe.
//   gimnasio: '' o el id de un gimnasio (gimnasioDe(cliente) dice el suyo).
export function filtrarClientes(
  clientes,
  { texto = '', filtro = '', profe = '', gimnasio = '', gimnasioDe, hoy },
) {
  const buscado = texto.trim().toLowerCase()
  return clientes.filter((cliente) => {
    if (!cumpleFiltro(cliente, filtro, hoy)) return false
    if (buscado && !`${cliente.nombre} ${cliente.apellido}`.toLowerCase().includes(buscado)) {
      return false
    }
    if (profe === 'sin' && cliente.profe_id) return false
    if (profe && profe !== 'sin' && cliente.profe_id !== profe) return false
    if (gimnasio && gimnasioDe && !gimnasioDe(cliente).includes(gimnasio)) return false
    return true
  })
}

// Cuántos hay en cada chip (sin contar el buscador ni los otros filtros).
export function contarPorFiltro(clientes, hoy) {
  const cuentas = {}
  for (const { id } of FILTROS) {
    cuentas[id] = clientes.filter((cliente) => cumpleFiltro(cliente, id, hoy)).length
  }
  return cuentas
}

// ---------- Orden (tabla de la compu) ----------
//   campo: 'nombre' | 'profe' | 'entreno' | 'vence'
//   nombreDelProfe(cliente): para ordenar por profe.
// Los que no tienen el dato (nunca entrenó, sin vencimiento) van al final.
export function ordenarClientes(
  clientes,
  { campo = 'nombre', ascendente = true, nombreDelProfe } = {},
) {
  const valor = {
    nombre: (cliente) => `${cliente.nombre || ''} ${cliente.apellido || ''}`.toLowerCase(),
    profe: (cliente) => (nombreDelProfe ? nombreDelProfe(cliente) : '').toLowerCase(),
    entreno: (cliente) => cliente.diasSinEntrenar,
    vence: (cliente) => cliente.vencimiento || null,
  }[campo]
  const signo = ascendente ? 1 : -1
  return [...clientes].sort((a, b) => {
    const x = valor(a)
    const y = valor(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    if (x < y) return -signo
    if (x > y) return signo
    return 0
  })
}
