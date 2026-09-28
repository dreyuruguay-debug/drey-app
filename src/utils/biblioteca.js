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

// Ejercicios archivados (supabase/sql/024): siguen en las rutinas y
// plantillas donde ya estaban, pero no se ofrecen para agregar.
export function estaArchivado(ejercicio) {
  return Boolean(ejercicio?.archivado_en)
}

export function ejerciciosActivos(ejercicios) {
  return ejercicios.filter((ejercicio) => !estaArchivado(ejercicio))
}

// "3 rutinas (de 2 clientes) y 1 plantilla", a partir de lo que devuelve
// uso_de_ejercicio. Vacío si no está en ninguna.
export function textoUso({ rutinas = 0, clientes = 0, plantillas = 0 } = {}) {
  const partes = []
  if (rutinas > 0) {
    const deClientes = clientes > 0 ? ` (de ${cantidad(clientes, 'cliente', 'clientes')})` : ''
    partes.push(`${cantidad(rutinas, 'rutina', 'rutinas')}${deClientes}`)
  }
  if (plantillas > 0) partes.push(cantidad(plantillas, 'plantilla', 'plantillas'))
  return partes.join(' y ')
}

function cantidad(numero, singular, plural) {
  return `${numero} ${numero === 1 ? singular : plural}`
}
