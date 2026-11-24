// Reglas de los comprobantes de pago que se suben (alumno → su profe, en
// Suscripción; profe o gimnasio → DREY, en Suscripción DREY). Son las
// mismas que pone la base en el bucket "comprobantes" (supabase/sql/040):
// así la app avisa con un mensaje claro en vez de un error al subir.

export const TAMANO_MAXIMO_COMPROBANTE = 10 * 1024 * 1024 // 10 MB

// Devuelve el mensaje para mostrar si el archivo no sirve, o null si está
// bien. Revisar DESPUÉS de achicar la foto (utils/imagenes.js).
export function problemaDeComprobante(archivo) {
  if (!archivo) return null
  const tipo = archivo.type || ''
  if (!tipo.startsWith('image/') && tipo !== 'application/pdf') {
    return 'El comprobante tiene que ser una foto o un PDF.'
  }
  if (archivo.size > TAMANO_MAXIMO_COMPROBANTE) {
    return 'El comprobante pesa demasiado (máximo 10 MB). Probá con una captura de pantalla.'
  }
  return null
}
