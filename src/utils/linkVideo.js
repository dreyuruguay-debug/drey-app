// Links de video de la biblioteca: solo se aceptan los que empiezan con
// https:// (la base también lo exige, supabase/sql/024). Así nadie puede
// guardar un link raro que haga algo al tocarlo en el celular del alumno.
//
// Para no complicar al profe, se arreglan solos los casos comunes (igual
// que hizo el SQL 024 con los que ya estaban cargados):
//   "http://..."            → "https://..."
//   "youtu.be/abc"          → "https://youtu.be/abc"
//   "www.youtube.com/..."   → "https://www.youtube.com/..."

const LINK_SEGURO = /^https:\/\/\S+$/i
const TIENE_PROTOCOLO = /^[a-z][a-z0-9+.-]*:/i
const PARECE_DIRECCION = /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i

export const ERROR_LINK_VIDEO =
  'El link del video tiene que empezar con https://. Copialo desde "Compartir" en el video.'

// Devuelve { valor, error }: valor es el link listo para guardar (o null
// si el campo quedó vacío); error, el mensaje para mostrar si no sirve.
export function normalizarLinkVideo(texto) {
  let link = String(texto ?? '').trim()
  if (!link) return { valor: null, error: null }
  if (/^http:\/\//i.test(link)) link = `https://${link.slice(7)}`
  else if (!TIENE_PROTOCOLO.test(link) && PARECE_DIRECCION.test(link)) link = `https://${link}`
  if (!LINK_SEGURO.test(link)) return { valor: null, error: ERROR_LINK_VIDEO }
  return { valor: link, error: null }
}

// Para mostrar un link guardado: solo si es https:// (si quedara alguno
// viejo de otro tipo, no se muestra el botón).
export function linkVideoSeguro(url) {
  return typeof url === 'string' && LINK_SEGURO.test(url) ? url : null
}
