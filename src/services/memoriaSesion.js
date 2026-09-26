import { supabase } from './supabaseClient.js'

// Memoria de la app mientras está abierta: guarda lo último que se cargó
// en cada pantalla para que, al volver a ella, se vea al instante (y se
// actualice por detrás). No se guarda en el celular: al cerrar la app o
// recargar la página se vacía sola.
//
// Todo lo guardado es de un usuario: al cerrar sesión (o si entra otra
// persona) se borra, así nadie ve lo del anterior.

const memoria = new Map()
const tareas = new Map()
let usuarioDeLaMemoria = null

supabase.auth.onAuthStateChange((evento, sesion) => {
  const usuarioId = sesion?.user?.id || null
  if (evento === 'SIGNED_OUT' || usuarioId !== usuarioDeLaMemoria) {
    memoria.clear()
    tareas.clear()
    usuarioDeLaMemoria = usuarioId
  }
})

export function recordar(clave, valor) {
  memoria.set(clave, valor)
}

// Lo guardado con esa clave, o undefined si no hay nada.
export function recordado(clave) {
  return memoria.get(clave)
}

export function olvidar(clave) {
  memoria.delete(clave)
}

// Ejecuta "tarea" una sola vez aunque la pidan varias pantallas a la vez
// (todas esperan el mismo resultado) y no la repite hasta que pasen
// "cadaMs" milisegundos: mientras tanto devuelve null (= "ya estaba
// hecho"). Sirve para trabajos pesados que no hace falta repetir en cada
// pantalla (por ejemplo, armar los resúmenes de 4 semanas).

export function unaVezCada(clave, cadaMs, tarea) {
  const previa = tareas.get(clave)
  if (previa?.pendiente) return previa.promesa
  if (previa && Date.now() - previa.hecha < cadaMs) return Promise.resolve(null)

  const registro = { pendiente: true, hecha: 0, promesa: null }
  registro.promesa = Promise.resolve()
    .then(tarea)
    .then(
      (resultado) => {
        registro.pendiente = false
        registro.hecha = Date.now()
        return resultado
      },
      (error) => {
        // Si falla, la próxima vez se vuelve a intentar.
        tareas.delete(clave)
        throw error
      },
    )
  tareas.set(clave, registro)
  return registro.promesa
}
