// Guardar y leer datos en el celular (localStorage) sin que la app se
// rompa si el navegador no lo permite (modo privado, memoria llena...).
// Todo lo que la app guarda en el celular pasa por acá.

export function leerJSON(clave, porDefecto = null) {
  try {
    const texto = localStorage.getItem(clave)
    return texto ? JSON.parse(texto) : porDefecto
  } catch {
    return porDefecto
  }
}

// Devuelve true si se pudo guardar.
export function guardarJSON(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
    return true
  } catch {
    return false
  }
}

export function borrarClave(clave) {
  try {
    localStorage.removeItem(clave)
  } catch {
    // Nada que borrar.
  }
}

// Todas las claves guardadas que empiezan con "prefijo".
export function clavesConPrefijo(prefijo) {
  try {
    return Object.keys(localStorage).filter((clave) => clave.startsWith(prefijo))
  } catch {
    return []
  }
}

// Un identificador único (para que un entrenamiento guardado sin señal
// no se registre dos veces si se reenvía).
export function nuevoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  // Navegadores viejos: mismo formato, armado a mano.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (letra) => {
    const azar = (Math.random() * 16) | 0
    return (letra === 'x' ? azar : (azar & 0x3) | 0x8).toString(16)
  })
}
