// Texto "normalizado" para comparar y buscar: en minúsculas, sin tildes
// y sin espacios de más. Así "extension" encuentra "Extensión" y
// "JALON" encuentra "Jalón".
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
