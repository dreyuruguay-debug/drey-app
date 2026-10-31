import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { usuarioGuardado } from './sesion.js'
import { olvidarTodo, recordado, recordar, unaVezCada } from './memoriaSesion.js'
import { guardarJSON, leerJSON } from '../utils/almacenLocal.js'
import { SOLO_CLIENTES } from '../utils/roles.js'

// El ESPACIO ACTIVO del panel (supabase/sql/032).
//
// Un profe puede trabajar en varios espacios: el suyo (sus alumnos
// particulares) y los gimnasios donde da clases. Arriba del panel elige
// en cuál está (components/SelectorEspacio.jsx) y todo el panel muestra
// lo de ese espacio. El Admin no tiene espacios: ve todo, como siempre.
//
//   · La lista sale de la base (mis_espacios()). La última conocida queda
//     anotada en el celular: el panel abre al instante y se actualiza por
//     detrás una vez por sesión.
//   · El espacio elegido se recuerda en el celular y en la base
//     (elegir_espacio), así en otro celular abre en el mismo.
//   · Al cambiar de espacio se avisa con EVENTO_ESPACIO: App.jsx vuelve a
//     armar las pantallas, que cargan de nuevo con el filtro del espacio.
//
// Esto solo decide qué se muestra. Lo que cada uno puede ver lo controla
// la base (puede_ver_cliente).

const CLAVE_CELULAR = 'drey-espacios'
const CLAVE_MEMORIA = 'mis-espacios'
// Claves de la memoria que sobreviven al cambio de espacio.
const CLAVES_QUE_QUEDAN = ['es-profe', CLAVE_MEMORIA]
const ACTUALIZAR_CADA_MS = 5 * 60 * 1000

export const EVENTO_ESPACIO = 'drey-espacio'

// Lo último que se supo de este usuario: { espacios, activo } o null.
function guardado() {
  const usuario = usuarioGuardado()
  if (!usuario) return null
  const enMemoria = recordado(CLAVE_MEMORIA)
  if (enMemoria?.usuarioId === usuario.id) return enMemoria
  const enCelular = leerJSON(CLAVE_CELULAR)
  if (enCelular?.usuarioId === usuario.id && Array.isArray(enCelular.espacios)) {
    recordar(CLAVE_MEMORIA, enCelular)
    return enCelular
  }
  return null
}

function guardar(estado) {
  recordar(CLAVE_MEMORIA, estado)
  guardarJSON(CLAVE_CELULAR, estado)
}

// Lista de espacios del profe (la última conocida), o null si todavía no
// se sabe en este celular.
export function misEspaciosConocidos() {
  return guardado()?.espacios ?? null
}

// El espacio elegido: el que eligió en este celular; si no, el último
// que eligió en la base; si no, el primero (el suyo).
function elegirActivo(espacios, preferido) {
  if (!espacios?.length) return null
  return (
    espacios.find((espacio) => espacio.id === preferido) ||
    espacios.find((espacio) => espacio.ultimo) ||
    espacios[0]
  )
}

// El espacio activo (objeto con id, tipo, nombre, rol, cupos...) o null.
export function espacioActivo() {
  const estado = guardado()
  return elegirActivo(estado?.espacios, estado?.activo)
}

export function espacioActivoId() {
  return espacioActivo()?.id ?? null
}

// Pide la lista a la base y la guarda. Si cambia el espacio activo (por
// ejemplo, la primera vez en este celular, o lo sacaron de un gimnasio),
// avisa. Devuelve la lista (vacía para el Admin o si la base todavía no
// tiene el SQL 032).
export async function actualizarMisEspacios() {
  const usuario = usuarioGuardado()
  if (!usuario) return []
  const { data, error } = await supabase.rpc('mis_espacios')
  if (error) return misEspaciosConocidos() || []

  const antes = guardado()
  const espacios = (data || []).map(espacioDesdeFila)
  const activo = elegirActivo(espacios, antes?.activo)
  guardar({ usuarioId: usuario.id, espacios, activo: activo?.id ?? null })
  if ((antes?.activo ?? null) !== (activo?.id ?? null)) avisarCambio(activo?.id ?? null)
  else window.dispatchEvent(new CustomEvent(EVENTO_ESPACIO, { detail: { soloDatos: true } }))
  return espacios
}

// Una vez cada tanto (lo llama el menú del panel en cada pantalla).
export function refrescarMisEspacios() {
  return unaVezCada('mis-espacios', ACTUALIZAR_CADA_MS, actualizarMisEspacios)
}

// Cambia de espacio: lo recuerda, borra lo que se mostraba del otro y
// avisa para que las pantallas se vuelvan a cargar.
export function elegirEspacio(id) {
  const estado = guardado()
  if (!estado || estado.activo === id) return
  guardar({ ...estado, activo: id })
  olvidarTodo({ menos: CLAVES_QUE_QUEDAN })
  avisarCambio(id)
  // Que la base lo recuerde (para abrir ahí en otro celular). Si falla
  // no pasa nada: en este celular ya quedó.
  supabase.rpc('elegir_espacio', { p_espacio: id }).then(
    () => {},
    () => {},
  )
}

function avisarCambio(id) {
  window.dispatchEvent(new CustomEvent(EVENTO_ESPACIO, { detail: { activo: id } }))
}

function espacioDesdeFila(fila) {
  return {
    id: fila.id,
    tipo: fila.tipo,
    codigo: fila.codigo,
    nombre: fila.nombre,
    rol: fila.rol,
    estado: fila.estado,
    estadoReal: fila.estado_real,
    planDrey: fila.plan_drey,
    planNombre: fila.plan_nombre,
    planPedido: fila.plan_drey_pedido,
    cuposTotal: fila.cupos_total,
    cuposUsados: fila.cupos_usados ?? 0,
    sinCosto: Boolean(fila.sin_costo),
    profesHabilitan: Boolean(fila.profes_habilitan),
    pruebaHasta: fila.prueba_hasta,
    vencimiento: fila.vencimiento,
    avisoPago: Boolean(fila.aviso_pago),
    comprobante: fila.comprobante,
    ultimo: Boolean(fila.ultimo),
  }
}

// Nombre para mostrar: el espacio personal es "Tus alumnos".
export function nombreDeEspacio(espacio) {
  if (!espacio) return ''
  return espacio.tipo === 'profe' ? 'Tus alumnos' : espacio.nombre
}

// ¿Es el dueño del espacio? (en su espacio personal, siempre).
export function esDuenoDe(espacio) {
  return espacio?.rol === 'dueno'
}

// Para las pantallas: { espacios, activo } y se vuelve a dibujar cuando
// cambian.
export function useEspacios() {
  const [estado, setEstado] = useState(() => ({
    espacios: misEspaciosConocidos(),
    activo: espacioActivo(),
  }))
  useEffect(() => {
    const alCambiar = () => setEstado({ espacios: misEspaciosConocidos(), activo: espacioActivo() })
    window.addEventListener(EVENTO_ESPACIO, alCambiar)
    return () => window.removeEventListener(EVENTO_ESPACIO, alCambiar)
  }, [])
  return estado
}

// Solo el id del espacio activo, y solo cambia cuando se elige otro (no
// cuando se actualizan sus números). Lo usa App.jsx para rearmar las
// pantallas.
export function useEspacioActivoId() {
  const [id, setId] = useState(espacioActivoId)
  useEffect(() => {
    const alCambiar = () => setId(espacioActivoId())
    window.addEventListener(EVENTO_ESPACIO, alCambiar)
    return () => window.removeEventListener(EVENTO_ESPACIO, alCambiar)
  }, [])
  return id
}

// FILTRO DEL PANEL: los alumnos del espacio activo (y los que todavía no
// tienen espacio, que esperan que alguien los tome, como siempre).
// Sin espacio activo (el Admin, o la base sin el SQL 032) no filtra.
//   delEspacioActivo(supabase.from('perfiles').select('*'))
export function delEspacioActivo(consulta) {
  const id = espacioActivoId()
  return id ? consulta.or(`espacio_id.eq.${id},espacio_id.is.null`) : consulta
}

// Atajo: los clientes (ni profes ni Admin) del espacio activo.
//   clientesDelEspacio('id, nombre').eq('estado', 'activo').order('nombre')
export function clientesDelEspacio(columnas = '*', opciones) {
  return delEspacioActivo(supabase.from('perfiles').select(columnas, opciones).match(SOLO_CLIENTES))
}
