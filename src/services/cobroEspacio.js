import { supabase } from './supabaseClient.js'

// Cobro a los alumnos de cada espacio (profe o gimnasio), supabase/sql/034.
//
// Cada espacio tiene sus planes (services/configuracion.js →
// guardarPlanDeEspacio) y sus DATOS DE COBRO: banco, titular, cuenta,
// moneda, alias y un link general de Mercado Pago. Acá se leen y se
// guardan esos datos, y se buscan los de un espacio por su código (en el
// registro, sin sesión) o los del alumno que inició sesión (Suscripción).
//
// Los datos se manejan siempre con esta forma:
//   { banco, titular, cuenta, moneda, alias, linkMercadoPago, espacio }

export const COBRO_VACIO = {
  banco: '',
  titular: '',
  cuenta: '',
  moneda: '',
  alias: '',
  linkMercadoPago: '',
}

function cobroDesdeFila(fila) {
  if (!fila) return null
  return {
    banco: fila.banco || '',
    titular: fila.titular || '',
    cuenta: fila.cuenta || '',
    moneda: fila.moneda || '',
    alias: fila.alias || '',
    linkMercadoPago: fila.link_mp || '',
    espacio: fila.espacio || '',
  }
}

// Los datos de cobro de un espacio (para que su dueño o el Admin los vea y
// los cambie). Devuelve { datos, error }; datos vacíos si todavía no cargó.
export async function cargarDatosDeCobro(espacioId) {
  const { data, error } = await supabase
    .from('datos_cobro')
    .select('banco, titular, cuenta, moneda, alias, link_mp')
    .eq('espacio_id', espacioId)
    .maybeSingle()
  return { datos: cobroDesdeFila(data) || { ...COBRO_VACIO }, error }
}

// Guarda los datos de cobro del espacio. Devuelve el error, o null.
export async function guardarDatosDeCobro(espacioId, datos) {
  const { error } = await supabase.rpc('guardar_datos_cobro', {
    p_espacio: espacioId,
    p_banco: limpio(datos.banco),
    p_titular: limpio(datos.titular),
    p_cuenta: limpio(datos.cuenta),
    p_moneda: limpio(datos.moneda),
    p_alias: limpio(datos.alias),
    p_link_mp: limpio(datos.linkMercadoPago),
  })
  return error
}

// Registro (sin sesión): los planes visibles del espacio con ese código.
// Devuelve { planes, error } con la misma forma que data/planes.js.
export async function cargarPlanesDeEspacio(codigo) {
  const { data, error } = await supabase.rpc('planes_de_espacio', { p_codigo: codigo })
  const planes = (data || []).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion || '',
    precioPrimerMes: fila.precio_primer_mes,
    precioDesdeSegundoMes: fila.precio_mensual,
    linkMercadoPago: fila.link_mp || '',
    activo: true,
  }))
  return { planes, error }
}

// Registro (sin sesión): cómo se le paga al espacio con ese código.
export async function cargarCobroDeEspacio(codigo) {
  const { data, error } = await supabase.rpc('datos_cobro_de_espacio', { p_codigo: codigo })
  return { cobro: cobroDesdeFila(data), error }
}

// Suscripción: cómo le paga el alumno que inició sesión a su profe o
// gimnasio. Devuelve { cobro, error }.
export async function cargarMiCobro() {
  const { data, error } = await supabase.rpc('mi_cobro')
  return { cobro: cobroDesdeFila(data), error }
}

// Los datos listos para mostrar ({ Banco: 'BROU', Alias: '…' }), o null
// si no hay ninguno cargado.
export function datosParaMostrar(cobro) {
  if (!cobro) return null
  const datos = Object.fromEntries(
    [
      ['Banco', cobro.banco],
      ['Titular', cobro.titular],
      ['Cuenta', cobro.cuenta],
      ['Moneda', cobro.moneda],
      ['Alias', cobro.alias],
    ].filter(([, valor]) => valor && String(valor).trim()),
  )
  return Object.keys(datos).length ? datos : null
}

function limpio(texto) {
  const valor = (texto ?? '').toString().trim()
  return valor || null
}
