// Métodos de entrenamiento que el profe puede elegir para cada bloque
// de una rutina. Cada método dice:
//   - explicacion: el texto del botón ⓘ "¿Qué significa?".
//   - ejercicios: cuántos ejercicios forman el bloque. 1 = se aplica a un
//     solo ejercicio; 2 o 3 = fijo; { minimo } = el profe elige cuántos.
//   - campos: los datos que el profe configura (se guardan en "config").
//   - instruccion(config): el texto que ve el cliente en el gimnasio.
//   - relojPropio: true si en el futuro tendrá un reloj especial
//     (EMOM, AMRAP...). Por ahora usa el temporizador de descanso común.
//   - principal: true para los tipos de bloque que el asistente del profe
//     muestra primero (Ejercicio único, Superserie, Triserie, Serie
//     gigante, Circuito). El resto aparece en "Otros métodos".
//   - resumen: cuántos ejercicios lleva, en pocas palabras (para las
//     tarjetas del asistente).
//
// El nombre que se muestra arriba de cada bloque es lo que está antes de
// " / " (por ejemplo "Superserie" en "Superserie / Biserie").

export const METODOS = [
  {
    id: 'normal',
    nombre: 'Ejercicio único',
    ejercicios: 1,
    principal: true,
    resumen: '1 ejercicio',
    explicacion:
      'Un solo ejercicio dentro del bloque, con sus series, repeticiones, carga y descanso (serie convencional). Ejemplo: Press banca.',
    campos: [],
    instruccion: () => '',
  },
  {
    id: 'biserie',
    nombre: 'Superserie / Biserie',
    ejercicios: 2,
    principal: true,
    resumen: '2 ejercicios',
    explicacion:
      'Dos ejercicios realizados consecutivamente, con poco o ningún descanso entre ellos. Después de completar ambos se realiza el descanso correspondiente. Ejemplo: Press banca + Aperturas.',
    campos: [],
    instruccion: () => 'Hacé los 2 ejercicios seguidos y recién ahí descansá.',
  },
  {
    id: 'triserie',
    nombre: 'Triserie',
    ejercicios: 3,
    principal: true,
    resumen: '3 ejercicios',
    explicacion:
      'Tres ejercicios realizados consecutivamente antes del descanso. Ejemplo: Press banca + Press inclinado + Aperturas.',
    campos: [],
    instruccion: () => 'Hacé los 3 ejercicios seguidos y recién ahí descansá.',
  },
  {
    id: 'giant_set',
    nombre: 'Serie gigante / Giant Set',
    ejercicios: { minimo: 4 },
    principal: true,
    resumen: '4 o más ejercicios',
    explicacion:
      'Cuatro o más ejercicios realizados consecutivamente, normalmente con descansos mínimos entre ejercicios y un descanso más largo al terminar la secuencia.',
    campos: [{ clave: 'pausa_entre', etiqueta: 'Pausa entre ejercicios (seg)', tipo: 'numero' }],
    instruccion: (config) =>
      config.pausa_entre
        ? `Hacé todos los ejercicios seguidos, con ${config.pausa_entre} s entre uno y otro. Al terminar la vuelta, descansá.`
        : 'Hacé todos los ejercicios seguidos. Al terminar la vuelta, descansá.',
  },
  {
    id: 'circuito',
    nombre: 'Circuito',
    ejercicios: { minimo: 2 },
    principal: true,
    resumen: '2 o más, por rondas',
    explicacion:
      'Secuencia de varios ejercicios realizados uno después de otro. Al completar todos los ejercicios se completa una ronda y puede repetirse durante varias rondas.',
    campos: [{ clave: 'rondas', etiqueta: 'Rondas', tipo: 'numero' }],
    instruccion: (config) =>
      config.rondas
        ? `Circuito de ${config.rondas} rondas: hacé todos los ejercicios seguidos y descansá al terminar cada ronda.`
        : 'Hacé todos los ejercicios seguidos y descansá al terminar cada ronda.',
  },
  {
    id: 'top_set',
    resumen: '1 ejercicio',
    nombre: 'Top Set',
    ejercicios: 1,
    explicacion:
      'Serie principal realizada con la carga más alta o el nivel de esfuerzo objetivo del ejercicio en esa sesión. Ejemplo: press banca, subir progresivamente hasta 1x5 @ RPE 8.',
    campos: [],
    instruccion: () => 'Subí la carga de a poco hasta la serie principal del día.',
  },
  {
    id: 'back_off',
    resumen: '1 ejercicio',
    nombre: 'Back-off Sets',
    ejercicios: 1,
    explicacion:
      'Series posteriores al Top Set utilizando una carga inferior. Ejemplo: Top Set 1x5 con 100 kg → Back-off 3x8 con 90 kg.',
    campos: [{ clave: 'porcentaje', etiqueta: '% menos que el Top Set', tipo: 'numero' }],
    instruccion: (config) =>
      config.porcentaje
        ? `Usá un ${config.porcentaje}% menos de carga que en el Top Set.`
        : 'Usá menos carga que en el Top Set.',
  },
  {
    id: 'drop_set',
    resumen: '1 ejercicio',
    nombre: 'Drop Set',
    ejercicios: 1,
    explicacion:
      'Después de una serie se reduce la carga para continuar haciendo repeticiones. Puede configurarse uno o varios descensos.',
    campos: [
      { clave: 'bajadas', etiqueta: 'Cantidad de bajadas', tipo: 'numero' },
      { clave: 'porcentaje', etiqueta: '% que baja cada vez', tipo: 'numero' },
    ],
    instruccion: (config) => {
      const bajadas = config.bajadas || 1
      const texto = bajadas === 1 ? '1 vez' : `${bajadas} veces`
      return config.porcentaje
        ? `Al terminar cada serie, bajá la carga un ${config.porcentaje}% ${texto} y seguí sin descansar.`
        : `Al terminar cada serie, bajá la carga ${texto} y seguí sin descansar.`
    },
  },
  {
    id: 'rest_pause',
    resumen: '1 ejercicio',
    nombre: 'Rest-Pause',
    ejercicios: 1,
    relojPropio: true,
    explicacion:
      'Serie exigente seguida de un descanso muy corto y algunas repeticiones adicionales con la misma carga.',
    campos: [
      { clave: 'pausa', etiqueta: 'Pausa corta (seg)', tipo: 'numero' },
      { clave: 'pausas', etiqueta: 'Cantidad de pausas', tipo: 'numero' },
    ],
    instruccion: (config) =>
      `Al terminar la serie, pausá ${config.pausa || 15} s y hacé unas reps más con la misma carga${
        config.pausas ? ` (${config.pausas} veces)` : ''
      }.`,
  },
  {
    id: 'myo_reps',
    resumen: '1 ejercicio',
    nombre: 'Myo-Reps',
    ejercicios: 1,
    relojPropio: true,
    explicacion:
      'Serie inicial de activación relativamente exigente seguida de mini-series de pocas repeticiones, separadas por descansos muy cortos.',
    campos: [
      { clave: 'reps_mini', etiqueta: 'Reps por mini-serie', tipo: 'numero' },
      { clave: 'pausa', etiqueta: 'Pausa entre mini-series (seg)', tipo: 'numero' },
    ],
    instruccion: (config) =>
      `Serie de activación y después mini-series de ${config.reps_mini || 3}-5 reps con ${
        config.pausa || 5
      } s de pausa.`,
  },
  {
    id: 'amrap',
    resumen: '1 ejercicio',
    nombre: 'AMRAP',
    ejercicios: 1,
    relojPropio: true,
    explicacion:
      'As Many Reps As Possible: realizar tantas repeticiones como sea posible con una carga determinada o dentro de un tiempo establecido, según lo programe el profesor.',
    campos: [{ clave: 'minutos', etiqueta: 'Minutos (vacío = sin tiempo)', tipo: 'numero' }],
    instruccion: (config) =>
      config.minutos
        ? `Hacé todas las repeticiones que puedas en ${config.minutos} minutos.`
        : 'Hacé todas las repeticiones que puedas con la carga indicada.',
  },
  {
    id: 'emom',
    resumen: '1 ejercicio',
    nombre: 'EMOM',
    ejercicios: 1,
    relojPropio: true,
    explicacion:
      'Every Minute On the Minute: comenzar un bloque de trabajo al inicio de cada minuto. Una vez terminadas las repeticiones, el tiempo restante del minuto funciona como descanso.',
    campos: [{ clave: 'minutos', etiqueta: 'Minutos en total', tipo: 'numero' }],
    instruccion: (config) =>
      `Al empezar cada minuto hacé las reps indicadas; lo que sobra del minuto es tu descanso${
        config.minutos ? ` (${config.minutos} minutos)` : ''
      }.`,
  },
]

export function obtenerMetodo(id) {
  return METODOS.find((metodo) => metodo.id === id) || METODOS[0]
}

// true si el método junta varios ejercicios en un mismo bloque.
export function esMetodoDeBloque(id) {
  return obtenerMetodo(id).ejercicios !== 1
}

// Nombre corto de un método ("Superserie" en "Superserie / Biserie").
export function nombreCortoDeMetodo(id) {
  return obtenerMetodo(id).nombre.split(' / ')[0]
}

// Cuántos ejercicios se pueden elegir para un método:
// { minimo, maximo } (maximo = null cuando no tiene tope).
export function limitesDeEjercicios(id) {
  const { ejercicios } = obtenerMetodo(id)
  if (typeof ejercicios === 'number') return { minimo: ejercicios, maximo: ejercicios }
  return { minimo: ejercicios.minimo, maximo: null }
}

export function linkBusquedaGoogle(metodo) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${metodo.nombre} método entrenamiento`)}`
}
