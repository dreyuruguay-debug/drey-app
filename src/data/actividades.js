// Sugerencias rápidas para el calentamiento previo y la vuelta a la
// calma de una rutina. El profe las toca para sumarlas de un toque, o
// escribe cualquier otra actividad a mano.
//
// Cada actividad se guarda como { nombre, duracion, items }:
//   - duracion: texto libre ("10 min", "30 s por lado").
//   - items: ejercicios puntuales dentro de la actividad (por ejemplo,
//     los ejercicios de "Movilidad").

export const SECCIONES_ACTIVIDADES = {
  calentamiento: {
    titulo: 'Calentamiento previo',
    icono: '🔥',
    vacio: 'Sin configurar todavía',
    boton: '+ Configurar calentamiento',
    sugerencias: ['Cinta', 'Bicicleta', 'Elíptica', 'Remo', 'Movilidad', 'Activación'],
  },
  vuelta_calma: {
    titulo: 'Vuelta a la calma',
    icono: '🧘',
    vacio: 'Opcional',
    boton: '+ Agregar vuelta a la calma',
    sugerencias: ['Caminata suave', 'Respiración', 'Movilidad', 'Estiramientos', 'Bicicleta suave'],
  },
}

// Ejercicios sugeridos para sumar adentro de una actividad (por ejemplo,
// dentro de "Movilidad" o "Estiramientos").
export const SUGERENCIAS_ITEMS = [
  'Rotaciones de hombros',
  'Movilidad torácica',
  'Circunducciones de brazos',
  'Movilidad de cadera',
  'Estiramiento de cuádriceps',
  'Estiramiento de isquiotibiales',
]

export function actividadVacia(nombre = '') {
  return { nombre, duracion: '', items: [] }
}
