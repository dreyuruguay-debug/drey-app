import { normalizarTexto } from './texto.js'

// Búsqueda en la biblioteca de ejercicios: no importan las tildes ni las
// mayúsculas, las palabras pueden ir en cualquier orden ("mancuernas
// press banca") y también busca por músculo ("gemelos", "cuello").

// El texto de cada ejercicio se prepara una sola vez (no en cada letra
// que se escribe en el buscador).
const textoDeEjercicio = new WeakMap()

function textoBuscable(ejercicio) {
  let texto = textoDeEjercicio.get(ejercicio)
  if (texto === undefined) {
    texto = normalizarTexto(`${ejercicio.nombre} ${ejercicio.grupo_muscular || ''}`)
    textoDeEjercicio.set(ejercicio, texto)
  }
  return texto
}

// Los ejercicios que tienen todas las palabras buscadas (todos, si no se
// escribió nada).
export function filtrarPorBusqueda(ejercicios, busqueda) {
  const palabras = normalizarTexto(busqueda).split(' ').filter(Boolean)
  if (palabras.length === 0) return ejercicios
  return ejercicios.filter((ejercicio) => {
    const texto = textoBuscable(ejercicio)
    return palabras.every((palabra) => texto.includes(palabra))
  })
}
