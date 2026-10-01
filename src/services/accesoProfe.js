import { supabase } from './supabaseClient.js'
import { obtenerUsuarioActual, usuarioGuardado } from './sesion.js'
import { recordado, recordar } from './memoriaSesion.js'
import { guardarJSON, leerJSON } from '../utils/almacenLocal.js'
import { SOLO_CLIENTES, entraAlPanel } from '../utils/roles.js'

// ¿Quién usa la app entra al panel? (profe o Admin, ver utils/roles.js).
// Lo usa el menú del panel (components/ProfeLayout.jsx) para decidir si
// muestra la pantalla. En esta sección "esProfe" quiere decir "entra al
// panel"; "esAdmin" dice además si es la cuenta Admin.
//
// Antes cada pantalla del profe le preguntaba al servidor antes de
// mostrar nada. Ahora:
//   · Se pregunta UNA vez por sesión (después queda en memoria).
//   · La respuesta se anota en el celular: la próxima vez que abre la app
//     la pantalla se muestra al instante y la pregunta se hace por detrás.
//
// Esto no abre ningún acceso: los datos del panel los protege la base de
// datos (solo un profe puede leerlos). Solo decide qué pantalla dibujar.

const CLAVE_CELULAR = 'drey-es-profe'
const CLAVE_MEMORIA = 'es-profe'
const CLAVE_PAGOS = 'pagos-pendientes'

// Lo que ya se sabe, sin esperar: true / false, o null si todavía no se
// sabe (primera vez en este celular).
export function esProfeConocido() {
  const usuario = usuarioGuardado()
  if (!usuario) return null
  const enMemoria = recordado(CLAVE_MEMORIA)
  if (enMemoria?.usuarioId === usuario.id) return enMemoria.esProfe
  const enCelular = leerJSON(CLAVE_CELULAR)
  if (enCelular?.usuarioId === usuario.id) return Boolean(enCelular.esProfe)
  return null
}

// ¿Es la cuenta Admin? Igual que esProfeConocido: true / false, o null
// si todavía no se sabe en este celular.
export function esAdminConocido() {
  const usuario = usuarioGuardado()
  if (!usuario) return null
  const enMemoria = recordado(CLAVE_MEMORIA)
  if (enMemoria?.usuarioId === usuario.id && 'esAdmin' in enMemoria) return enMemoria.esAdmin
  const enCelular = leerJSON(CLAVE_CELULAR)
  if (enCelular?.usuarioId === usuario.id && 'esAdmin' in enCelular)
    return Boolean(enCelular.esAdmin)
  return null
}

// Confirma con el servidor (una sola vez por sesión).
// Devuelve { usuarioId, esProfe, esAdmin }, o { usuarioId: null } si no
// hay sesión.
// Si ya hay una pregunta en camino (el menú y la pantalla preguntan a la
// vez), se espera esa en vez de hacer otra.
let verificacionEnCurso = null

export function verificarProfe() {
  if (!verificacionEnCurso) {
    verificacionEnCurso = preguntarAlServidor().finally(() => {
      verificacionEnCurso = null
    })
  }
  return verificacionEnCurso
}

async function preguntarAlServidor() {
  const usuario = await obtenerUsuarioActual()
  if (!usuario) return { usuarioId: null, esProfe: false }

  const enMemoria = recordado(CLAVE_MEMORIA)
  if (enMemoria?.usuarioId === usuario.id && 'esAdmin' in enMemoria) return enMemoria

  const { data, error } = await supabase
    .from('perfiles')
    .select('es_profe, es_admin')
    .eq('id', usuario.id)
    .single()
  if (error) {
    // Sin señal o error del servidor: se usa lo último que se supo.
    return {
      usuarioId: usuario.id,
      esProfe: Boolean(esProfeConocido()),
      esAdmin: Boolean(esAdminConocido()),
    }
  }
  const resultado = {
    usuarioId: usuario.id,
    esProfe: entraAlPanel(data),
    esAdmin: Boolean(data?.es_admin),
  }
  recordar(CLAVE_MEMORIA, resultado)
  guardarJSON(CLAVE_CELULAR, resultado)
  return resultado
}

// Número rojo sobre "Pagos" (cuentas nuevas + avisos de pago).
// ultimosPagosPendientes: lo último que se contó, para mostrarlo al
// instante. contarPagosPendientes: lo cuenta de nuevo (solo el número,
// sin traer la lista de clientes).
export function ultimosPagosPendientes() {
  return recordado(CLAVE_PAGOS) || 0
}

export async function contarPagosPendientes() {
  const { count, error } = await supabase
    .from('perfiles')
    .select('id', { count: 'exact', head: true })
    .match(SOLO_CLIENTES)
    .or('estado.eq.pendiente,aviso_pago.is.true')
  if (error) return ultimosPagosPendientes()
  recordar(CLAVE_PAGOS, count || 0)
  return count || 0
}

// Número sobre "Clientes": solicitudes de alumnos esperando respuesta
// (las del profe; el Admin ve todas). Si la base todavía no tiene el SQL
// 026, cuenta 0.
const CLAVE_SOLICITUDES = 'solicitudes-pendientes'
// Cada vez que se cuentan, se avisa (así el número del menú se actualiza
// apenas el profe responde una, sin cambiar de pantalla).
export const EVENTO_SOLICITUDES = 'drey-solicitudes'

export function ultimasSolicitudesPendientes() {
  return recordado(CLAVE_SOLICITUDES) || 0
}

export async function contarSolicitudesPendientes() {
  const { count, error } = await supabase
    .from('solicitudes_profe')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente')
  if (error) return ultimasSolicitudesPendientes()
  recordar(CLAVE_SOLICITUDES, count || 0)
  window.dispatchEvent(new CustomEvent(EVENTO_SOLICITUDES, { detail: count || 0 }))
  return count || 0
}
