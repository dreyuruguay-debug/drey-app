// Achica una foto antes de subirla: las fotos del celular pesan 3–8 MB y
// para verlas en la app alcanza con ~200 KB. Así se suben más rápido
// (incluso con poca señal), gastan menos datos y ocupan menos lugar en
// Supabase.
//
// Devuelve un archivo JPG nuevo, o el mismo archivo si no es una imagen o
// si el navegador no puede achicarla.
export async function comprimirImagen(archivo, ladoMaximo = 1280, calidad = 0.82) {
  if (!archivo?.type?.startsWith('image/') || archivo.type === 'image/gif') return archivo
  try {
    const imagen = await createImageBitmap(archivo)
    const escala = Math.min(1, ladoMaximo / Math.max(imagen.width, imagen.height))
    const ancho = Math.round(imagen.width * escala)
    const alto = Math.round(imagen.height * escala)
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    lienzo.getContext('2d').drawImage(imagen, 0, 0, ancho, alto)
    imagen.close?.()
    const blob = await new Promise((resolver) => lienzo.toBlob(resolver, 'image/jpeg', calidad))
    if (!blob || blob.size >= archivo.size) return archivo
    const nombre = archivo.name.replace(/\.[^.]+$/, '') || 'foto'
    return new File([blob], `${nombre}.jpg`, { type: 'image/jpeg' })
  } catch {
    return archivo
  }
}

// Fotos de la biblioteca que vienen con la app (carpeta public/ejercicios,
// por ejemplo "/ejercicios/fitcron-12.webp"). Cada una tiene al lado una
// versión chica y quieta en public/ejercicios/mini, que es la que usan
// las listas: así una lista de 200 ejercicios no descarga 200 animaciones.
// Las fotos que sube el profe (Supabase) no tienen versión chica: se usa
// la misma.
const CARPETA_EJERCICIOS = '/ejercicios/'

export function miniaturaDeEjercicio(url) {
  if (typeof url !== 'string' || !url) return null
  if (!url.startsWith(CARPETA_EJERCICIOS)) return url
  return `${CARPETA_EJERCICIOS}mini/${url.slice(CARPETA_EJERCICIOS.length)}`
}
