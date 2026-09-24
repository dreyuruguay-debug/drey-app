import { obtenerMetodo, esMetodoDeBloque, cantidadDeEjercicios } from '../data/metodos.js'

// Agrupa los ejercicios de una rutina (ya ordenados) en bloques: los
// ejercicios seguidos que comparten el mismo "grupo" son un solo bloque
// (una biserie, un circuito...); el resto son bloques de un ejercicio.
// A los bloques de varios ejercicios les pone una letra (A, B, C...)
// para mostrarlos como "Biserie A", "Circuito B", etc.
//
// Devuelve: [{ metodo, config, letra, items: [{ item, indice }] }]
// donde "indice" es la posición del ejercicio en la lista original.
export function agruparEnBloques(items) {
  const bloques = []
  items.forEach((item, indice) => {
    const anterior = bloques[bloques.length - 1]
    if (item.grupo && anterior && anterior.grupo === item.grupo) {
      anterior.items.push({ item, indice })
      return
    }
    bloques.push({
      grupo: item.grupo || null,
      metodo: item.metodo || 'normal',
      config: item.config || {},
      items: [{ item, indice }],
    })
  })

  let letra = 0
  for (const bloque of bloques) {
    bloque.letra = bloque.items.length > 1 ? String.fromCharCode(65 + letra++) : null
  }
  return bloques
}

// Nombre que se muestra arriba de un bloque ("Biserie A", "Drop Set").
export function tituloDeBloque(bloque) {
  const metodo = obtenerMetodo(bloque.metodo)
  const nombreCorto = metodo.nombre.split(' / ')[0]
  return bloque.letra ? `${nombreCorto} ${bloque.letra}` : nombreCorto
}

// --- Cambios sobre la lista de ejercicios del editor del profe ---
//
// Estas funciones no guardan nada: reciben la lista, devuelven una lista
// nueva con los cambios y el editor guarda después solo las filas que
// cambiaron (ver filasCambiadas). Así la lógica se puede probar sola.

function copiar(items) {
  return items.map((item) => ({ ...item, config: { ...(item.config || {}) } }))
}

// Deshace el bloque "grupo": sus ejercicios vuelven a ser series normales.
function deshacerBloque(items, grupo) {
  if (!grupo) return
  for (const item of items) {
    if (item.grupo === grupo) {
      item.grupo = null
      item.metodo = 'normal'
      item.config = {}
    }
  }
}

function numerarOrden(items) {
  items.forEach((item, indice) => {
    item.orden = indice
  })
  return items
}

function nuevoIdDeGrupo() {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// Aplica un método al ejercicio de la posición "indice". Si el método
// junta varios ejercicios (biserie, triserie...), usa ese ejercicio y
// los siguientes. Devuelve { items } o { error } con un texto para el profe.
export function aplicarMetodo(items, indice, metodoId, config = {}) {
  const copia = copiar(items)
  deshacerBloque(copia, copia[indice].grupo)

  if (!esMetodoDeBloque(metodoId)) {
    copia[indice].metodo = metodoId
    copia[indice].grupo = null
    copia[indice].config = { ...config }
    return { items: copia }
  }

  const cantidad = cantidadDeEjercicios(metodoId, config)
  const disponibles = copia.length - indice
  if (disponibles < cantidad) {
    const faltan = cantidad - disponibles
    return {
      error: `Para ${obtenerMetodo(metodoId).nombre} hacen falta ${cantidad} ejercicios seguidos. Agregá ${faltan} más debajo de este y volvé a elegir el método.`,
    }
  }

  for (let j = indice; j < indice + cantidad; j++) deshacerBloque(copia, copia[j].grupo)
  const grupo = nuevoIdDeGrupo()
  for (let j = indice; j < indice + cantidad; j++) {
    copia[j].metodo = metodoId
    copia[j].grupo = grupo
    copia[j].config = j === indice ? { ...config, cantidad } : {}
  }
  return { items: copia }
}

// Mueve un ejercicio una posición arriba (-1) o abajo (+1). Dentro de un
// mismo bloque solo cambia el orden; si sale de su bloque o entra en
// otro, esos bloques se deshacen para no dejar bloques incompletos.
export function moverEjercicio(items, indice, direccion) {
  const destino = indice + direccion
  if (destino < 0 || destino >= items.length) return { items }
  const copia = copiar(items)
  const a = copia[indice]
  const b = copia[destino]

  if (a.grupo && a.grupo === b.grupo) {
    // La configuración del bloque vive en su primer ejercicio: si cambia
    // cuál es el primero, se la pasa al nuevo.
    const primero = Math.min(indice, destino)
    const config = copia[primero].config
    copia[indice] = b
    copia[destino] = a
    copia[primero].config = config
    copia[primero === indice ? destino : indice].config = {}
  } else {
    deshacerBloque(copia, a.grupo)
    deshacerBloque(copia, b.grupo)
    copia[indice] = b
    copia[destino] = a
  }
  return { items: numerarOrden(copia) }
}

// Saca un ejercicio de la lista. Si era parte de un bloque, el bloque se
// deshace (sus otros ejercicios quedan como series normales).
export function quitarEjercicio(items, indice) {
  const copia = copiar(items)
  deshacerBloque(copia, copia[indice].grupo)
  copia.splice(indice, 1)
  return { items: numerarOrden(copia) }
}

// Filas que cambiaron entre dos versiones de la lista (por id), para
// guardar solo esas en la base de datos.
export function filasCambiadas(antes, despues) {
  const porId = new Map(antes.map((item) => [item.id, item]))
  return despues.filter((item) => {
    const previo = porId.get(item.id)
    if (!previo) return false
    return (
      previo.orden !== item.orden ||
      previo.metodo !== item.metodo ||
      (previo.grupo || null) !== (item.grupo || null) ||
      JSON.stringify(previo.config || {}) !== JSON.stringify(item.config || {})
    )
  })
}
