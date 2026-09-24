import { diasEntre, textoFechaCorta } from './dias.js'
import { linkWhatsApp } from './whatsapp.js'

// Arma la lista "Para hacer hoy" del Inicio del profe a partir de los
// datos de sus clientes. Nada de este archivo lee ni guarda en la base:
// recibe datos y devuelve la lista, así se puede probar solo.
//
// Cada tarea: { id, nivel: 'urgente' | 'aviso', icono, titulo, detalle,
//               accion: { texto, to } o { texto, href } }
// Las urgentes (pagos, clientes sin rutina) van primero.

export const DIAS_PARA_INACTIVO = 5
const DIAS_AVISO_VENCIMIENTO = 3
const MAXIMO_POR_TIPO = 3

function nombreCompleto(cliente) {
  return `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim() || 'Cliente'
}

function plural(cantidad, singular, pluralTexto) {
  return cantidad === 1 ? singular : pluralTexto
}

function listaDeNombres(clientes) {
  const nombres = clientes.slice(0, 3).map(nombreCompleto)
  const resto = clientes.length - nombres.length
  return resto > 0 ? `${nombres.join(', ')} y ${resto} más` : nombres.join(', ')
}

export function armarTareas({
  clientes = [],
  rutinas = [],
  calendario = [],
  ultimaSesion = {},
  resumenesBorrador = [],
  hoy,
}) {
  const tareas = []
  const pendientes = clientes.filter((cliente) => cliente.estado === 'pendiente')
  const avisaronPago = clientes.filter(
    (cliente) => cliente.aviso_pago && cliente.estado !== 'pendiente',
  )
  const activos = clientes.filter((cliente) => cliente.estado === 'activo')

  if (pendientes.length) {
    tareas.push({
      id: 'cuentas-nuevas',
      nivel: 'urgente',
      icono: 'pago',
      titulo: `${pendientes.length} ${plural(pendientes.length, 'cuenta nueva para habilitar', 'cuentas nuevas para habilitar')}`,
      detalle: listaDeNombres(pendientes),
      accion: { texto: 'Revisar', to: '/profe/cuentas' },
    })
  }
  if (avisaronPago.length) {
    tareas.push({
      id: 'pagos',
      nivel: 'urgente',
      icono: 'pago',
      titulo: `${avisaronPago.length} ${plural(avisaronPago.length, 'pago para confirmar', 'pagos para confirmar')}`,
      detalle: listaDeNombres(avisaronPago),
      accion: { texto: 'Revisar', to: '/profe/cuentas' },
    })
  }

  // Rutinas y días de cada cliente activo.
  const rutinasPorCliente = new Map()
  for (const rutina of rutinas) {
    if (!rutinasPorCliente.has(rutina.cliente_id)) rutinasPorCliente.set(rutina.cliente_id, [])
    rutinasPorCliente.get(rutina.cliente_id).push(rutina)
  }
  const conDias = new Set(
    calendario.filter((fila) => fila.rutina_id).map((fila) => fila.cliente_id),
  )

  const sinRutina = []
  const enBorrador = []
  const sinDias = []
  const inactivos = []
  const porVencer = []
  const vencidos = []

  for (const cliente of activos) {
    const suyas = rutinasPorCliente.get(cliente.id) || []
    const guardadas = suyas.filter((rutina) => rutina.publicada !== false)
    const borradores = suyas.filter((rutina) => rutina.publicada === false)

    if (!guardadas.length && !borradores.length) sinRutina.push(cliente)
    for (const rutina of borradores) enBorrador.push({ cliente, rutina })
    if (guardadas.length && !conDias.has(cliente.id)) sinDias.push(cliente)

    if (guardadas.length && conDias.has(cliente.id)) {
      const base = ultimaSesion[cliente.id] || cliente.creado_en?.slice(0, 10)
      const dias = base ? diasEntre(base, hoy) : null
      if (dias !== null && dias >= DIAS_PARA_INACTIVO) {
        inactivos.push({ cliente, dias, entreno: Boolean(ultimaSesion[cliente.id]) })
      }
    }

    if (cliente.vencimiento && !cliente.aviso_pago) {
      const faltan = diasEntre(hoy, cliente.vencimiento)
      if (faltan < 0) vencidos.push(cliente)
      else if (faltan <= DIAS_AVISO_VENCIMIENTO) porVencer.push(cliente)
    }
  }

  if (sinRutina.length > MAXIMO_POR_TIPO) {
    tareas.push({
      id: 'sin-rutina',
      nivel: 'urgente',
      icono: 'rutina',
      titulo: `${sinRutina.length} clientes no tienen rutina`,
      detalle: listaDeNombres(sinRutina),
      accion: { texto: 'Ver', to: '/profe/clientes' },
    })
  } else {
    for (const cliente of sinRutina) {
      tareas.push({
        id: `sin-rutina-${cliente.id}`,
        nivel: 'urgente',
        icono: 'rutina',
        titulo: `${nombreCompleto(cliente)} no tiene rutina`,
        detalle: 'Todavía no le armaste ninguna',
        accion: { texto: 'Armar', to: `/profe/rutinas/nueva/${cliente.id}` },
      })
    }
  }

  for (const cliente of vencidos) {
    tareas.push({
      id: `vencido-${cliente.id}`,
      nivel: 'urgente',
      icono: 'pago',
      titulo: `El plan de ${nombreCompleto(cliente)} venció`,
      detalle: `Venció el ${textoFechaCorta(cliente.vencimiento)}`,
      accion: { texto: 'Ver', to: `/profe/clientes/${cliente.id}?tab=pagos` },
    })
  }

  for (const { cliente, rutina } of enBorrador) {
    tareas.push({
      id: `borrador-${rutina.id}`,
      nivel: 'aviso',
      icono: 'rutina',
      titulo: `"${rutina.nombre}" quedó sin guardar`,
      detalle: `Rutina de ${nombreCompleto(cliente)} · todavía no la ve`,
      accion: { texto: 'Seguir', to: `/profe/rutinas/${rutina.id}` },
    })
  }

  for (const cliente of sinDias) {
    tareas.push({
      id: `sin-dias-${cliente.id}`,
      nivel: 'aviso',
      icono: 'calendario',
      titulo: `${nombreCompleto(cliente)} no tiene días asignados`,
      detalle: 'Tiene rutina pero no sabe qué día hacerla',
      accion: { texto: 'Asignar', to: `/profe/clientes/${cliente.id}?tab=semana` },
    })
  }

  inactivos.sort((a, b) => b.dias - a.dias)
  for (const { cliente, dias, entreno } of inactivos) {
    const whatsapp = linkWhatsApp(
      cliente.celular,
      `Hola ${cliente.nombre || ''}! ¿Cómo andás? Hace unos días que no entrenás, ¿te espero esta semana? 💪`,
    )
    tareas.push({
      id: `inactivo-${cliente.id}`,
      nivel: 'aviso',
      icono: 'reloj',
      titulo: entreno
        ? `${nombreCompleto(cliente)} no entrena hace ${dias} días`
        : `${nombreCompleto(cliente)} todavía no empezó a entrenar`,
      detalle: entreno
        ? 'Tiene rutina y días asignados'
        : `Tiene todo listo pero no registró entrenamientos (${dias} días)`,
      accion: whatsapp
        ? { texto: 'Escribirle', href: whatsapp }
        : { texto: 'Ver', to: `/profe/clientes/${cliente.id}` },
    })
  }

  for (const resumen of resumenesBorrador) {
    const cliente = clientes.find((item) => item.id === resumen.cliente_id)
    if (!cliente) continue
    tareas.push({
      id: `resumen-${resumen.id || cliente.id}`,
      nivel: 'aviso',
      icono: 'grafico',
      titulo: 'Resumen de 4 semanas listo',
      detalle: `${nombreCompleto(cliente)} · falta que lo apruebes`,
      accion: { texto: 'Revisar', to: `/profe/clientes/${cliente.id}/progreso` },
    })
  }

  for (const cliente of porVencer) {
    tareas.push({
      id: `vence-${cliente.id}`,
      nivel: 'aviso',
      icono: 'pago',
      titulo: `El plan de ${nombreCompleto(cliente)} vence pronto`,
      detalle: `Vence el ${textoFechaCorta(cliente.vencimiento)}`,
      accion: { texto: 'Ver', to: `/profe/clientes/${cliente.id}?tab=pagos` },
    })
  }

  return tareas.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'urgente' ? -1 : 1))
}

// Primeros pasos de un profe nuevo. Devuelve null cuando ya hizo todo.
export function primerosPasos({ ejercicios = 0, clientesActivos = 0, rutinas = 0 }) {
  const pasos = [
    { texto: 'Cargá tus ejercicios', hecho: ejercicios > 0, to: '/profe/ejercicios' },
    { texto: 'Habilitá a tu primer cliente', hecho: clientesActivos > 0, to: '/profe/cuentas' },
    { texto: 'Armale su primera rutina', hecho: rutinas > 0, to: '/profe/rutinas' },
  ]
  return pasos.every((paso) => paso.hecho) ? null : pasos
}
