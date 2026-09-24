// Guarda en el celular el entrenamiento que el cliente tiene a medias
// (series marcadas, pesos, hora de inicio), así si toca "Pausar", se le
// cierra la app o se queda sin batería, al volver sigue donde estaba.
// Solo vale para el mismo día: al día siguiente arranca de cero.
const PREFIJO = 'drey-entreno-'

export function leerEnCurso(rutinaId, hoyISO) {
  try {
    const datos = JSON.parse(localStorage.getItem(PREFIJO + rutinaId) || 'null')
    return datos && datos.fecha === hoyISO ? datos : null
  } catch {
    return null
  }
}

export function guardarEnCurso(rutinaId, datos) {
  try {
    localStorage.setItem(PREFIJO + rutinaId, JSON.stringify(datos))
  } catch {
    // Sin almacenamiento: el entrenamiento sigue igual, solo no se recupera.
  }
}

export function borrarEnCurso(rutinaId) {
  try {
    localStorage.removeItem(PREFIJO + rutinaId)
  } catch {
    // Nada que borrar.
  }
}
