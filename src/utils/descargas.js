// Baja un archivo armado en la app (una planilla, un PDF) al celular o
// la compu.
export function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// "ana-perez" a partir de "Ana Pérez" (para nombres de archivo).
export function textoParaArchivo(texto) {
  return (
    String(texto ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'alumno'
  )
}
