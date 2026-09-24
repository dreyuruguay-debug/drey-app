import { categoriasDeEjercicio } from './categorias.js'

// Grupos musculares que el profe elige en el paso 2 del asistente para
// crear una rutina ("Grupos musculares a trabajar").
//
// Cada grupo sabe cómo reconocer sus ejercicios en la biblioteca, así
// después se le recomiendan al profe al agregar ejercicios:
//   - grupos: valores de "grupo_muscular" de la biblioteca que son
//     exactamente de ese músculo (los ejercicios que venían cargados).
//     Estos se recomiendan primero.
//   - categorias: categorías de la biblioteca (Empuje, Tracción...) donde
//     también suele haber ejercicios de ese músculo.
//
// Para sumar un grupo nuevo alcanza con agregarlo a esta lista.
export const GRUPOS_MUSCULARES = [
  { nombre: 'Pecho', grupos: ['Pectorales'], categorias: ['Empuje'] },
  { nombre: 'Espalda', grupos: ['Espalda'], categorias: ['Tracción'] },
  { nombre: 'Hombros', grupos: ['Hombros'], categorias: ['Empuje'] },
  { nombre: 'Bíceps', grupos: ['Bíceps'], categorias: ['Tracción', 'Brazos'] },
  { nombre: 'Tríceps', grupos: ['Tríceps'], categorias: ['Empuje', 'Brazos'] },
  { nombre: 'Antebrazo', grupos: ['Antebrazo'], categorias: ['Brazos'] },
  { nombre: 'Cuádriceps', grupos: ['Piernas'], categorias: ['Piernas'] },
  { nombre: 'Isquiotibiales', grupos: ['Piernas'], categorias: ['Piernas'] },
  { nombre: 'Glúteos', grupos: ['Glúteos'], categorias: ['Piernas'] },
  { nombre: 'Gemelos', grupos: ['Piernas'], categorias: ['Piernas'] },
  { nombre: 'Aductores y abductores', grupos: ['Piernas'], categorias: ['Piernas'] },
  { nombre: 'Abdominales', grupos: ['Abdominales'], categorias: ['Zona media'] },
  { nombre: 'Lumbar', grupos: [], categorias: ['Zona media'] },
  { nombre: 'Cardio', grupos: [], categorias: ['Cardiorrespiratorio'] },
]

export const NOMBRES_GRUPOS_MUSCULARES = GRUPOS_MUSCULARES.map((grupo) => grupo.nombre)

// Qué tan relacionado está un ejercicio con los grupos elegidos:
// 2 = es exactamente de uno de esos músculos, 1 = está en una categoría
// afín, 0 = no tiene relación.
export function relevanciaDeEjercicio(ejercicio, nombresDeGrupos = []) {
  const categorias = categoriasDeEjercicio(ejercicio)
  let relevancia = 0
  for (const nombre of nombresDeGrupos) {
    const grupo = GRUPOS_MUSCULARES.find((item) => item.nombre === nombre)
    if (!grupo) continue
    if (grupo.grupos.includes(ejercicio.grupo_muscular)) return 2
    if (grupo.categorias.some((categoria) => categorias.includes(categoria))) relevancia = 1
  }
  return relevancia
}

// Ejercicios recomendados para los grupos elegidos: primero los que son
// exactamente de esos músculos y después los de categorías afines.
export function ejerciciosRecomendados(ejercicios, nombresDeGrupos = []) {
  return ejercicios
    .map((ejercicio) => ({
      ejercicio,
      relevancia: relevanciaDeEjercicio(ejercicio, nombresDeGrupos),
    }))
    .filter(({ relevancia }) => relevancia > 0)
    .sort(
      (a, b) => b.relevancia - a.relevancia || a.ejercicio.nombre.localeCompare(b.ejercicio.nombre),
    )
    .map(({ ejercicio }) => ejercicio)
}

// Texto para mostrar los grupos de una rutina ("Pecho · Hombros").
export function textoGrupos(grupos = []) {
  return grupos.join(' · ')
}
