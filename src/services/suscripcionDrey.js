import { supabase } from './supabaseClient.js'
import { obtenerUsuarioActual } from './sesion.js'
import { comprimirImagen } from '../utils/imagenes.js'
import { normalizarTexto } from '../utils/texto.js'

// Suscripción DREY: lo que pagan los profes y gimnasios a DREY, por cupos
// de alumnos (supabase/sql/032). La usan "Suscripción DREY" del panel
// (pages/ProfeSuscripcionDrey.jsx) y las pantallas del Admin (Ajustes →
// DREY, Pagos → Suscripciones DREY, Equipo → Espacios).
//
// Cada función devuelve { datos, error } o el error (null si salió bien).
// Lo que cada uno puede hacer lo controla la base.

// --- Planes DREY ---------------------------------------------------------------

export function planDreyDesdeFila(fila) {
  return {
    id: fila.id,
    nombre: fila.nombre,
    tipo: fila.tipo,
    cupos: fila.cupos,
    precioMensual: fila.precio_mensual,
    precioPrimerMes: fila.precio_primer_mes,
    linkMercadoPago: fila.link_mp || '',
    descripcion: fila.descripcion || '',
    activo: fila.activo !== false,
    orden: fila.orden ?? 0,
  }
}

// Los planes DREY (los visibles; el Admin ve también los ocultos).
export async function cargarPlanesDrey() {
  const { data, error } = await supabase.from('planes_drey').select('*').order('orden')
  return { planes: (data || []).map(planDreyDesdeFila), error }
}

function filaDesdePlanDrey(plan) {
  const primerMes = String(plan.precioPrimerMes ?? '').trim()
  return {
    nombre: plan.nombre.trim(),
    tipo: plan.tipo === 'gimnasio' ? 'gimnasio' : 'profe',
    cupos: Math.round(Number(plan.cupos)),
    precio_mensual: Math.round(Number(plan.precioMensual)),
    precio_primer_mes: primerMes === '' ? null : Math.round(Number(primerMes)),
    link_mp: limpio(plan.linkMercadoPago),
    descripcion: limpio(plan.descripcion),
    activo: plan.activo !== false,
  }
}

export async function guardarPlanDrey(id, plan) {
  const { data, error } = await supabase
    .from('planes_drey')
    .update(filaDesdePlanDrey(plan))
    .eq('id', id)
    .select('id')
  if (error) return error
  return data?.length ? null : { message: 'Sin permiso' }
}

// Plan nuevo: su identificador sale del nombre ("Gimnasio 300" →
// "gimnasio-300"); si ya existe, se le agrega un número.
export async function crearPlanDrey(plan, existentes = []) {
  const base =
    normalizarTexto(plan.nombre)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'plan-drey'
  const ids = existentes.map((item) => item.id)
  let id = base
  for (let numero = 2; ids.includes(id); numero++) id = `${base}-${numero}`
  const orden = Math.max(0, ...existentes.map((item) => item.orden || 0)) + 10
  const { error } = await supabase
    .from('planes_drey')
    .insert({ id, orden, ...filaDesdePlanDrey(plan) })
  return error || null
}

// Devuelve el problema a corregir, o '' si está todo bien.
export function revisarPlanDrey(plan) {
  if (!plan.nombre?.trim()) return 'Poné un nombre para el plan.'
  const cupos = Number(plan.cupos)
  if (!Number.isInteger(cupos) || cupos <= 0) return 'Poné cuántos alumnos incluye (ej. 25).'
  const precio = Number(plan.precioMensual)
  if (String(plan.precioMensual).trim() === '' || !Number.isInteger(precio) || precio < 0) {
    return 'Poné el precio por mes en pesos, sin puntos ni decimales (ej. 1990).'
  }
  const primerMes = String(plan.precioPrimerMes ?? '').trim()
  if (primerMes !== '' && (!Number.isInteger(Number(primerMes)) || Number(primerMes) < 0)) {
    return 'El precio del primer mes va en pesos, sin puntos (o vacío si es el mismo).'
  }
  if (plan.linkMercadoPago && !/^https:\/\//i.test(plan.linkMercadoPago.trim())) {
    return 'El link de Mercado Pago tiene que empezar con https://'
  }
  return ''
}

// --- El dueño del espacio -----------------------------------------------------

export async function elegirPlanDrey(espacioId, planId) {
  const { error } = await supabase.rpc('elegir_plan_drey', {
    p_espacio: espacioId,
    p_plan: planId,
  })
  return error || null
}

// "Ya pagué": sube el comprobante (si eligió uno) a su carpeta del bucket
// "comprobantes" y le avisa al Admin.
export async function avisarPagoDrey(espacioId, archivo) {
  let ruta = null
  if (archivo) {
    const usuario = await obtenerUsuarioActual()
    if (!usuario) return { message: 'Sin sesión' }
    const subir = archivo.type?.startsWith('image/')
      ? await comprimirImagen(archivo, 1600)
      : archivo
    ruta = `${usuario.id}/drey-${Date.now()}-${subir.name.replace(/[^\w.-]/g, '_')}`
    const { error: errorSubida } = await supabase.storage.from('comprobantes').upload(ruta, subir)
    if (errorSubida) return errorSubida
  }
  const { error } = await supabase.rpc('avisar_pago_drey', {
    p_espacio: espacioId,
    p_comprobante: ruta,
  })
  return error || null
}

// Pagos a DREY de un espacio (el dueño los suyos; el Admin, todos).
export async function cargarPagosDrey(espacioId, limite = 24) {
  let consulta = supabase
    .from('pagos_drey')
    .select(
      'id, espacio_id, espacio_nombre, plan, cupos, monto, primer_mes, metodo, nota, periodo_desde, periodo_hasta, creado_en',
    )
    .order('creado_en', { ascending: false })
    .limit(limite)
  if (espacioId) consulta = consulta.eq('espacio_id', espacioId)
  const { data, error } = await consulta
  return { pagos: data || [], error }
}

// Números del espacio para el Inicio del dueño (resumen_espacio, SQL
// 035): cupos, alumnos activos, pendientes, avisos de pago, en gracia,
// vencidos, sin profe y sin entrenar hace X días. Devuelve
// { resumen, error } (resumen null si la base no tiene ese SQL).
export async function cargarResumenEspacio(espacioId, diasSinEntrenar = 7) {
  const { data, error } = await supabase.rpc('resumen_espacio', {
    p_espacio: espacioId,
    p_dias_sin_entrenar: diasSinEntrenar,
  })
  if (error || !data) return { resumen: null, error }
  return {
    resumen: {
      cuposTotal: data.cupos_total,
      cuposUsados: data.cupos_usados ?? 0,
      activos: data.activos ?? 0,
      pendientes: data.pendientes ?? 0,
      avisaronPago: data.avisaron_pago ?? 0,
      enGracia: data.en_gracia ?? 0,
      vencidos: data.vencidos ?? 0,
      sinProfe: data.sin_profe ?? 0,
      sinEntrenar: data.sin_entrenar ?? 0,
      diasSinEntrenar: data.dias_sin_entrenar ?? diasSinEntrenar,
    },
    error: null,
  }
}

// --- Admin ---------------------------------------------------------------------

function espacioDeResumen(fila) {
  return {
    id: fila.id,
    tipo: fila.tipo,
    codigo: fila.codigo,
    nombre: fila.nombre,
    estado: fila.estado,
    estadoReal: fila.estado_real,
    planDrey: fila.plan_drey,
    planNombre: fila.plan_nombre,
    planPedido: fila.plan_drey_pedido,
    pedidoNombre: fila.pedido_nombre,
    cuposExtra: fila.cupos_extra ?? 0,
    sinCosto: Boolean(fila.sin_costo),
    cuposSinCosto: fila.cupos_sin_costo,
    profesHabilitan: Boolean(fila.profes_habilitan),
    cuposTotal: fila.cupos_total,
    cuposUsados: fila.cupos_usados ?? 0,
    pruebaHasta: fila.prueba_hasta,
    vencimiento: fila.vencimiento,
    avisoPago: Boolean(fila.aviso_pago),
    avisoPagoEn: fila.aviso_pago_en,
    comprobante: fila.comprobante,
    dueno: fila.dueno || '',
    duenoEmail: fila.dueno_email || '',
    duenoCelular: fila.dueno_celular || '',
    profes: fila.profes ?? 0,
    creadoEn: fila.creado_en,
  }
}

// Todos los espacios con sus números (solo el Admin).
export async function cargarEspaciosAdmin() {
  const { data, error } = await supabase.rpc('resumen_espacios')
  return { espacios: (data || []).map(espacioDeResumen), error }
}

// Confirma un pago de un espacio: aplica su plan y suma un mes.
export async function registrarPagoDrey(espacioId, { monto, metodo, nota } = {}) {
  const valor = String(monto ?? '').trim()
  const { data, error } = await supabase.rpc('registrar_pago_drey', {
    p_espacio: espacioId,
    p_monto: valor === '' ? null : Math.round(Number(valor)),
    p_metodo: metodo || 'transferencia',
    p_nota: limpio(nota),
  })
  return { datos: data, error }
}

// Cambios a mano del Admin (Equipo → Espacios).
export async function guardarEspacio(id, cambios) {
  const fila = {}
  if ('nombre' in cambios) fila.nombre = cambios.nombre.trim()
  if ('codigo' in cambios) fila.codigo = cambios.codigo.trim().toUpperCase()
  if ('planDrey' in cambios) fila.plan_drey = cambios.planDrey || null
  if ('cuposExtra' in cambios)
    fila.cupos_extra = Math.max(0, Math.round(Number(cambios.cuposExtra) || 0))
  if ('sinCosto' in cambios) fila.sin_costo = Boolean(cambios.sinCosto)
  if ('cuposSinCosto' in cambios) {
    const valor = String(cambios.cuposSinCosto ?? '').trim()
    fila.cupos_sin_costo = valor === '' ? null : Math.max(0, Math.round(Number(valor)))
  }
  if ('profesHabilitan' in cambios) fila.profes_habilitan = Boolean(cambios.profesHabilitan)
  if ('estado' in cambios) fila.estado = cambios.estado
  if ('pruebaHasta' in cambios) fila.prueba_hasta = cambios.pruebaHasta || null
  if ('vencimiento' in cambios) fila.vencimiento = cambios.vencimiento || null
  const { data, error } = await supabase.from('espacios').update(fila).eq('id', id).select('id')
  if (error) return error
  return data?.length ? null : { message: 'Sin permiso' }
}

export async function borrarEspacio(id) {
  const { error } = await supabase.from('espacios').delete().eq('id', id)
  return error || null
}

// Abre el comprobante de un espacio (link temporal de 1 minuto).
export async function abrirComprobanteDrey(ruta) {
  if (!ruta) return false
  const { data, error } = await supabase.storage.from('comprobantes').createSignedUrl(ruta, 60)
  if (error || !data?.signedUrl) return false
  window.open(data.signedUrl, '_blank', 'noopener')
  return true
}

// Texto para un error de la base al guardar un espacio.
export function textoErrorEspacio(error) {
  const mensaje = error?.message || ''
  if (/espacios_codigo_unico|duplicate key/i.test(mensaje))
    return 'Ese código ya lo usa otro espacio.'
  if (/espacios_codigo_formato/i.test(mensaje)) {
    return 'El código va de 4 a 20 letras o números, sin espacios.'
  }
  if (/espacios|does not exist|schema cache/i.test(mensaje)) {
    return 'Falta instalar la actualización de la base (SQL 032)'
  }
  return 'No pudimos guardar. Probá de nuevo.'
}

export const METODOS_PAGO_DREY = {
  transferencia: 'Transferencia',
  mercadopago: 'Mercado Pago',
  efectivo: 'Efectivo',
  otro: 'Otro',
}

function limpio(texto) {
  const valor = (texto ?? '').toString().trim()
  return valor || null
}
