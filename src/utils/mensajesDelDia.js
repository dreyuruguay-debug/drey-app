import { fiestaDelDia, firmaDelSaludo } from '../data/fiestas.js'

// Qué mensajes grandes ve el alumno al abrir la app hoy, y cuáles ya vio.
//
// Cada mensaje del profe se muestra una vez por día (si dura varios días,
// una vez cada día). En una fiesta (data/fiestas.js), si el profe no
// escribió nada para ese día, aparece el saludo de la fiesta firmado con
// su nombre. Lo que ya vio se anota en el celular.
// Nada de este archivo lee ni guarda en la base de datos.

const CLAVE_VISTOS = 'drey-mensajes-vistos'

// Lista para mostrar: [{ id, texto, titulo, firma, fiesta }].
//   mensajes: los de hoy, como los entrega la base ([{ id, texto, personal }]).
//   profe: nombre del profe (o null).
export function mensajesParaMostrar({ mensajes, profe }, hoyISO) {
  const fiesta = fiestaDelDia(hoyISO)
  const delProfe = (mensajes || []).map((mensaje) => ({
    id: mensaje.id,
    texto: mensaje.texto,
    titulo: fiesta ? fiesta.titulo : mensaje.personal ? 'Un mensaje para vos' : 'Mensaje de tu profe',
    firma: profe || 'Tu profe',
    fiesta,
  }))
  if (!fiesta || delProfe.length > 0) return delProfe
  return [
    {
      id: `fiesta-${fiesta.id}`,
      texto: fiesta.saludo,
      titulo: fiesta.titulo,
      firma: firmaDelSaludo(profe),
      fiesta,
    },
  ]
}

// Los ids que ya vio hoy (lo de otros días se descarta).
export function leerVistos(hoyISO) {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_VISTOS) || 'null')
    return guardado?.fecha === hoyISO && Array.isArray(guardado.ids) ? guardado.ids : []
  } catch {
    return []
  }
}

export function marcarVistos(ids, hoyISO) {
  try {
    const todos = [...new Set([...leerVistos(hoyISO), ...ids])]
    localStorage.setItem(CLAVE_VISTOS, JSON.stringify({ fecha: hoyISO, ids: todos }))
  } catch {
    // Sin almacenamiento: se vuelven a mostrar la próxima vez.
  }
}

export function sinVer(lista, hoyISO) {
  const vistos = leerVistos(hoyISO)
  return lista.filter((mensaje) => !vistos.includes(mensaje.id))
}

// Estado de un mensaje para la lista del profe:
//   'hoy' (se está mostrando), 'programado' (todavía no) o 'terminado'.
export function estadoDeMensaje(mensaje, hoyISO) {
  if (mensaje.hasta < hoyISO) return 'terminado'
  if (mensaje.desde > hoyISO) return 'programado'
  return 'hoy'
}
