import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import {
  aplicarConfiguracion,
  configuracion,
  escucharConfiguracion,
} from '../data/configuracion.js'
import { PLANES } from '../data/planes.js'
import { normalizarTexto } from '../utils/texto.js'

// Trae de la base la configuración del negocio (tablas "ajustes" y
// "planes", supabase/sql/022) y la deja en data/configuracion.js, que es
// de donde la leen todas las pantallas. Y guarda los cambios que hace el
// Admin desde Ajustes (la base no deja que nadie más los haga).
//
// Si no hay señal o la base todavía no tiene el SQL 022, se sigue usando
// lo último conocido (o los valores por defecto): la app nunca se traba
// por esto.

function planDesdeFila(fila) {
  const respaldo = PLANES.find((plan) => plan.id === fila.id)
  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion ?? respaldo?.descripcion ?? '',
    precioPrimerMes: fila.precio_primer_mes,
    precioDesdeSegundoMes: fila.precio_mensual,
    linkMercadoPago: fila.link_mp || '',
    activo: fila.activo !== false,
    orden: fila.orden ?? 0,
  }
}

function ajustesDesdeFila(fila) {
  return {
    transferencia: {
      banco: fila.transferencia_banco || '',
      titular: fila.transferencia_titular || '',
      cuenta: fila.transferencia_cuenta || '',
      moneda: fila.transferencia_moneda || '',
    },
    cobroAutomatico: Boolean(fila.cobro_automatico),
    whatsappGrupoUrl: fila.whatsapp_grupo_url || '',
    diasAviso: fila.dias_aviso,
    diasDeGracia: fila.dias_de_gracia,
  }
}

let pedidoEnCurso = null

// Pide la configuración a la base. Si ya hay un pedido andando, espera
// ese (no se piden dos veces a la vez). Devuelve la configuración vigente.
export function cargarConfiguracion() {
  if (!pedidoEnCurso) {
    pedidoEnCurso = pedirConfiguracion().finally(() => {
      pedidoEnCurso = null
    })
  }
  return pedidoEnCurso
}

async function pedirConfiguracion() {
  try {
    const [respuestaPlanes, respuestaAjustes] = await Promise.all([
      supabase.from('planes').select('*').order('orden'),
      supabase.from('ajustes').select('*').eq('id', 1).maybeSingle(),
    ])
    const nueva = { ...configuracion() }
    if (!respuestaPlanes.error && respuestaPlanes.data?.length) {
      nueva.planes = respuestaPlanes.data.map(planDesdeFila)
    }
    if (!respuestaAjustes.error && respuestaAjustes.data) {
      Object.assign(nueva, ajustesDesdeFila(respuestaAjustes.data))
    }
    aplicarConfiguracion(nueva)
  } catch {
    // Sin señal: queda lo último conocido.
  }
  return configuracion()
}

// Para las pantallas: devuelve la configuración y vuelve a dibujar la
// pantalla cuando cambia (por ejemplo, cuando llega de la base).
export function useConfiguracion() {
  const [actual, setActual] = useState(configuracion)
  useEffect(() => escucharConfiguracion(setActual), [])
  return actual
}

// --- Cambios del Admin (Ajustes) -------------------------------------------
// Cada función devuelve el error de Supabase, o null si salió bien.

export async function guardarAjustes({
  transferencia,
  cobroAutomatico,
  whatsappGrupoUrl,
  diasAviso,
  diasDeGracia,
}) {
  const cambios = {}
  if (transferencia) {
    cambios.transferencia_banco = limpio(transferencia.banco)
    cambios.transferencia_titular = limpio(transferencia.titular)
    cambios.transferencia_cuenta = limpio(transferencia.cuenta)
    cambios.transferencia_moneda = limpio(transferencia.moneda)
  }
  if (cobroAutomatico !== undefined) cambios.cobro_automatico = Boolean(cobroAutomatico)
  if (whatsappGrupoUrl !== undefined) cambios.whatsapp_grupo_url = limpio(whatsappGrupoUrl)
  if (diasAviso !== undefined) cambios.dias_aviso = Number(diasAviso)
  if (diasDeGracia !== undefined) cambios.dias_de_gracia = Number(diasDeGracia)

  const { data, error } = await supabase.from('ajustes').update(cambios).eq('id', 1).select('id')
  if (error) return error
  // Sin filas cambiadas = la base no lo permitió (no es el Admin).
  if (!data?.length) return { message: 'Sin permiso' }
  await cargarConfiguracion()
  return null
}

export async function guardarPlan(id, plan) {
  const { data, error } = await supabase
    .from('planes')
    .update(filaDesdePlan(plan))
    .eq('id', id)
    .select('id')
  if (error) return error
  if (!data?.length) return { message: 'Sin permiso' }
  await cargarConfiguracion()
  return null
}

// Crea un plan nuevo. Su identificador sale del nombre ("Plan pareja" →
// "plan-pareja"); si ya existe uno igual, se le agrega un número.
export async function crearPlan(plan, idsExistentes = []) {
  const base = identificadorDesde(plan.nombre) || 'plan'
  let id = base
  for (let numero = 2; idsExistentes.includes(id); numero++) id = `${base}-${numero}`

  const orden = Math.max(0, ...listaOrdenes()) + 1
  const { error } = await supabase.from('planes').insert({ id, orden, ...filaDesdePlan(plan) })
  if (error) return error
  await cargarConfiguracion()
  return null
}

function listaOrdenes() {
  return (configuracion().planes || []).map((plan) => plan.orden || 0)
}

function filaDesdePlan(plan) {
  return {
    nombre: plan.nombre.trim(),
    descripcion: limpio(plan.descripcion),
    precio_primer_mes: Math.round(Number(plan.precioPrimerMes)),
    precio_mensual: Math.round(Number(plan.precioDesdeSegundoMes)),
    link_mp: limpio(plan.linkMercadoPago),
    activo: plan.activo !== false,
  }
}

function limpio(texto) {
  const valor = (texto ?? '').toString().trim()
  return valor || null
}

function identificadorDesde(nombre) {
  return normalizarTexto(nombre)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Historial de cambios del Admin (solo lo puede leer el Admin).
export async function cargarHistorial(limite = 100) {
  const { data, error } = await supabase
    .from('historial_admin')
    .select('id, creado_en, tipo, detalle')
    .order('creado_en', { ascending: false })
    .limit(limite)
  return { filas: data || [], error }
}
