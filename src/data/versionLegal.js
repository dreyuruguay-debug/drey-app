// Versión vigente de los términos y la política de privacidad (los
// textos están en data/legal.js). Vive en un archivo aparte y chico
// porque la usan el Registro y el Inicio, y así los textos largos solo
// se descargan cuando alguien los abre.
//
// Cambiar VERSION_TERMINOS (por la fecha del cambio) hace que todos los
// usuarios tengan que aceptar de nuevo la próxima vez que entren.
export const VERSION_TERMINOS = '2026-09-25'

// Poné true cuando un abogado haya revisado los textos de data/legal.js.
export const TEXTOS_REVISADOS = false

// true si esta persona todavía no aceptó la versión actual. Si la base
// todavía no tiene las columnas nuevas (SQL 011 sin instalar), no se le
// pide nada para no trabar a nadie.
export function necesitaAceptarTerminos(perfil) {
  // Profes y Admin no aceptan los términos de los clientes.
  if (!perfil || perfil.es_profe || perfil.es_admin) return false
  if (!('terminos_version' in perfil)) return false
  return perfil.terminos_version !== VERSION_TERMINOS
}
