// Avisos cortos ("Guardado ✓") que aparecen un momento abajo de la
// pantalla. Cualquier pantalla llama a mostrarAviso('Guardado') y el
// componente AvisoGlobal (montado una sola vez en App) lo muestra.
export const EVENTO_AVISO = 'drey-aviso'

export function mostrarAviso(texto, tipo = 'ok') {
  window.dispatchEvent(new CustomEvent(EVENTO_AVISO, { detail: { texto, tipo } }))
}
