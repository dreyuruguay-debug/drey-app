// Recuerda (solo en este celular) si el cliente ya vio la bienvenida de
// 3 pantallas (components/Bienvenida.jsx).
const CLAVE_BIENVENIDA = 'drey-bienvenida-vista'

// Guarda que este usuario ya vio la bienvenida (solo en este celular).
export function marcarBienvenidaVista(usuarioId) {
  try {
    localStorage.setItem(`${CLAVE_BIENVENIDA}-${usuarioId}`, '1')
  } catch {
    // Sin almacenamiento (modo privado): la vuelve a ver la próxima vez.
  }
}

export function yaVioBienvenida(usuarioId) {
  try {
    return localStorage.getItem(`${CLAVE_BIENVENIDA}-${usuarioId}`) === '1'
  } catch {
    return true
  }
}

// Para "Ver la bienvenida de nuevo" desde Perfil.
export function olvidarBienvenida(usuarioId) {
  try {
    localStorage.removeItem(`${CLAVE_BIENVENIDA}-${usuarioId}`)
  } catch {
    // Nada que borrar.
  }
}
