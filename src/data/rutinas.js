// Datos de ejemplo de las rutinas (Rutina A, B, C) y del calendario
// semanal del cliente. Estos datos los va a cargar el profe desde su
// panel (todavía no construido). Mientras tanto viven en un solo lugar
// para que Inicio, Rutinas y el detalle de una rutina usen siempre la
// misma información.
export const RUTINAS = {
  a: {
    id: 'a',
    nombre: 'Rutina A',
    patron: 'Patrón de empuje',
    musculos: 'Pectorales, hombros y tríceps · zona media',
    ejercicios: [
      {
        nombre: 'Press banca con barra',
        objetivoTexto: '60kg · 8 reps',
        kgObjetivo: 60,
        repsObjetivo: 8,
        anterior: '58kg · 8 reps',
      },
      {
        nombre: 'Press inclinado con mancuernas',
        objetivoTexto: '22kg · 10 reps',
        kgObjetivo: 22,
        repsObjetivo: 10,
        anterior: '20kg · 10 reps',
      },
    ],
  },
  b: {
    id: 'b',
    nombre: 'Rutina B',
    patron: 'Patrón de tracción',
    musculos: 'Espalda, bíceps y trapecios · zona media',
    ejercicios: [
      {
        nombre: 'Remo con barra',
        objetivoTexto: '50kg · 10 reps',
        kgObjetivo: 50,
        repsObjetivo: 10,
        anterior: '47.5kg · 10 reps',
      },
    ],
  },
  c: {
    id: 'c',
    nombre: 'Rutina C',
    patron: 'Full piernas',
    musculos: 'Glúteos, cuádriceps y femorales · zona media + cardio',
    ejercicios: [
      {
        nombre: 'Sentadilla',
        objetivoTexto: '70kg · 8 reps',
        kgObjetivo: 70,
        repsObjetivo: 8,
        anterior: '65kg · 8 reps',
      },
    ],
  },
}

// Calendario semanal: qué rutina (o descanso) le toca a este cliente
// cada día. rutinaId en null significa día de descanso.
export const CALENDARIO = [
  { dia: 'Lunes', rutinaId: 'a' },
  { dia: 'Martes', rutinaId: 'b' },
  { dia: 'Miércoles', rutinaId: null },
  { dia: 'Jueves', rutinaId: 'c' },
  { dia: 'Viernes', rutinaId: null },
  { dia: 'Sábado', rutinaId: null },
  { dia: 'Domingo', rutinaId: null },
]

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

// Devuelve el nombre del día de hoy tal como aparece en CALENDARIO.
export function obtenerNombreDiaHoy() {
  return NOMBRES_DIA[new Date().getDay()]
}

// Devuelve la rutina (objeto de RUTINAS) que le toca al cliente hoy,
// o null si hoy es día de descanso.
export function obtenerRutinaDeHoy() {
  const diaHoy = obtenerNombreDiaHoy()
  const entrada = CALENDARIO.find((item) => item.dia === diaHoy)
  if (!entrada || !entrada.rutinaId) return null
  return RUTINAS[entrada.rutinaId]
}
