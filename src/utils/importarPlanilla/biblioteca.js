import { estaArchivado } from '../biblioteca.js'
import { normalizarTexto } from '../texto.js'
import { textoFilas } from './informe.js'

// Encontrar cada ejercicio de la planilla en la biblioteca (o pedirle al profe que lo resuelva).
// Parte de la lectura de la planilla de Excel (ver utils/importarPlanilla.js).
export function indexarBiblioteca(lista) {
  const porId = new Map()
  const porNombre = new Map()
  for (const ejercicio of lista) {
    porId.set(ejercicio.id, ejercicio)
    const clave = normalizarTexto(ejercicio.nombre)
    porNombre.set(clave, [...(porNombre.get(clave) || []), ejercicio])
  }
  return { lista, porId, porNombre }
}

// Busca el ejercicio de cada renglón: primero por su ID (si el nombre
// coincide), después por el nombre exacto (sin tildes ni mayúsculas), y
// si no, queda para que el profe decida (vincular a uno de la biblioteca
// o crear uno nuevo). Deja fila.ejercicio y devuelve los desconocidos.
export function resolverEjercicios(filas, biblioteca, resoluciones, informe) {
  const desconocidos = new Map()
  for (const fila of filas) {
    const encontrado = buscarEnBiblioteca(fila.nombre, fila.idEjercicio, biblioteca)
    if (encontrado.aviso)
      informe.aviso(fila.lugares.ejercicio, `Fila ${fila.numero}: ${encontrado.aviso}`)
    if (encontrado.ejercicio) {
      fila.ejercicio = encontrado.ejercicio
      continue
    }
    if (!fila.nombre) {
      fila.ejercicio = null
      informe.error(fila.lugares.ejercicio, `Fila ${fila.numero}: falta el nombre del ejercicio.`)
      continue
    }
    const clave = normalizarTexto(fila.nombre)
    const resolucion = resoluciones[clave]
    const vinculado =
      resolucion?.tipo === 'vincular' && biblioteca.porId.get(resolucion.ejercicioId)
    if (vinculado) {
      fila.ejercicio = vinculado
      continue
    }
    if (resolucion?.tipo === 'crear' && resolucion.categoria) {
      fila.ejercicio = {
        id: null,
        nombre: fila.nombre.trim(),
        nuevo: { categoria: resolucion.categoria },
      }
      continue
    }
    fila.ejercicio = null
    const desconocido = desconocidos.get(clave) || {
      clave,
      nombre: fila.nombre,
      filas: [],
      motivo: encontrado.motivo,
      opciones: encontrado.opciones?.length
        ? encontrado.opciones
        : parecidos(fila.nombre, biblioteca),
    }
    desconocido.filas.push(fila.numero)
    desconocidos.set(clave, desconocido)
    if (desconocido.filas.length === 1) desconocido.lugar = fila.lugares.ejercicio
  }

  for (const desconocido of desconocidos.values()) {
    const filasTexto = textoFilas(desconocido.filas)
    informe.error(
      desconocido.lugar,
      desconocido.motivo === 'ambiguo'
        ? `${filasTexto}: hay ${desconocido.opciones.length} ejercicios llamados "${desconocido.nombre}" en la biblioteca. Elegí cuál es (abajo, en "Ejercicios para revisar").`
        : `${filasTexto}: el ejercicio "${desconocido.nombre}" no existe en la biblioteca. Vinculalo a uno que exista o crealo (abajo, en "Ejercicios para revisar").`,
    )
  }
  return [...desconocidos.values()]
}

function buscarEnBiblioteca(nombre, id, biblioteca) {
  const clave = normalizarTexto(nombre)
  const porId = id ? biblioteca.porId.get(id) : null
  if (porId && (!clave || normalizarTexto(porId.nombre) === clave)) {
    return { ejercicio: porId, aviso: avisoArchivado(porId) }
  }
  const porNombre = clave ? biblioteca.porNombre.get(clave) || [] : []
  const activos = porNombre.filter((ejercicio) => !estaArchivado(ejercicio))
  if (porNombre.length === 1 || activos.length === 1) {
    const ejercicio = porNombre.length === 1 ? porNombre[0] : activos[0]
    return { ejercicio, aviso: avisoArchivado(ejercicio) }
  }
  if (porNombre.length > 1) return { ejercicio: null, motivo: 'ambiguo', opciones: porNombre }
  if (porId) {
    return {
      ejercicio: porId,
      aviso: `"${nombre}" no está en la biblioteca con ese nombre: se usó "${porId.nombre}" (el ejercicio que tenía esa fila).`,
    }
  }
  return { ejercicio: null, motivo: 'no-existe' }
}

function avisoArchivado(ejercicio) {
  return estaArchivado(ejercicio)
    ? `"${ejercicio.nombre}" está archivado en la biblioteca: se usa igual, pero conviene cambiarlo por otro.`
    : undefined
}

// Los ejercicios de la biblioteca (en uso) más parecidos a un nombre.
export function parecidos(nombre, biblioteca, cantidad = 5) {
  const palabras = normalizarTexto(nombre)
    .split(' ')
    .filter((palabra) => palabra.length > 2)
  if (!palabras.length) return []
  return biblioteca.lista
    .filter((ejercicio) => !estaArchivado(ejercicio))
    .map((ejercicio) => {
      const texto = normalizarTexto(ejercicio.nombre)
      const propias = texto.split(' ')
      const puntos = palabras.reduce(
        (total, palabra) =>
          total +
          (propias.includes(palabra)
            ? 2
            : propias.some((propia) => propia.startsWith(palabra.slice(0, 4)))
              ? 1
              : 0),
        0,
      )
      return { ejercicio, puntos }
    })
    .filter(({ puntos }) => puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.ejercicio.nombre.localeCompare(b.ejercicio.nombre))
    .slice(0, cantidad)
    .map(({ ejercicio }) => ejercicio)
}
