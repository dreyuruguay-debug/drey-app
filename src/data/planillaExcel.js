// Formato oficial de la planilla de Excel de DREY (versión 1): qué hojas
// tiene, qué columnas y cómo se llaman. Es el "contrato" entre la planilla
// y la app: lo usan quien arma la planilla (utils/exportarPlanilla.js y
// services/planillaExcel.js) y quien la lee (utils/importarPlanilla.js).
//
// La app lee las columnas por su título (no por su posición): si el profe
// mueve una columna, agrega columnas propias o cambia el ancho, se sigue
// entendiendo. Para sumar un dato nuevo en el futuro alcanza con agregar
// su columna acá y leerla/escribirla: las planillas viejas (sin esa
// columna) se siguen pudiendo subir.
//
// Hojas:
//   Rutina         → un renglón por día de entrenamiento (Día 1, Día 2...)
//   Ejercicios     → un renglón por ejercicio, con series / repeticiones /
//                    peso de cada semana (SEMANA 1, SEMANA 2...)
//   Calentamiento  → series de calentamiento (aproximación) de cada ejercicio
//   Actividades    → calentamiento previo y vuelta a la calma de cada día
//   Configuración  → datos del archivo (versión, cliente) y ayuda
//   Listas         → oculta: ejercicios de la biblioteca con su ID y las
//                    opciones de las listas desplegables

export const FORMATO_PLANILLA = 'DREY rutinas'
export const VERSION_PLANILLA = 1

export const MAXIMO_DIAS = 14
export const MAXIMO_EJERCICIOS_POR_DIA = 60
export const MAXIMO_FILAS_POR_HOJA = 3000
export const MAXIMO_MEGAS = 5

export const HOJAS = {
  rutina: 'Rutina',
  ejercicios: 'Ejercicios',
  calentamiento: 'Calentamiento',
  actividades: 'Actividades',
  configuracion: 'Configuración',
  listas: 'Listas',
}

// Columnas de cada tabla. "otros": otros títulos que también se aceptan
// al leer. "texto": la celda es de texto (así Excel no convierte "8-10"
// en una fecha ni "1:30" en una hora). "oculta": dato técnico.
export const COLUMNAS_DIAS = [
  { clave: 'dia', titulo: 'Día', ancho: 7 },
  { clave: 'nombre', titulo: 'Nombre', ancho: 26 },
  { clave: 'grupos', titulo: 'Grupos musculares', ancho: 34, texto: true, otros: ['Músculos'] },
  { clave: 'descripcion', titulo: 'Descripción', ancho: 44, texto: true },
  {
    clave: 'pausa',
    titulo: 'Pausa entre ejercicios (s)',
    ancho: 16,
    texto: true,
    otros: ['Pausa'],
  },
  { clave: 'idRutina', titulo: 'ID rutina', ancho: 38, oculta: true },
]

export const COLUMNAS_EJERCICIOS_ANTES = [
  { clave: 'dia', titulo: 'Día', ancho: 6 },
  { clave: 'orden', titulo: 'Orden', ancho: 7 },
  { clave: 'bloque', titulo: 'Bloque', ancho: 8, texto: true },
  { clave: 'tipo', titulo: 'Tipo de bloque', ancho: 17, otros: ['Tipo', 'Método'] },
  { clave: 'ejercicio', titulo: 'Ejercicio', ancho: 36, otros: ['Ejercicios'] },
]

// Las tres columnas de cada semana, debajo de "SEMANA 1", "SEMANA 2"...
export const COLUMNAS_SEMANA = [
  { clave: 'series', titulo: 'Series', ancho: 8 },
  { clave: 'reps', titulo: 'Repeticiones', ancho: 13, texto: true, otros: ['Reps'] },
  { clave: 'kg', titulo: 'Peso (kg)', ancho: 10, otros: ['Peso', 'Kg', 'Carga'] },
]

export const COLUMNAS_EJERCICIOS_DESPUES = [
  { clave: 'descanso', titulo: 'Descanso (s)', ancho: 12, texto: true, otros: ['Descanso'] },
  { clave: 'rpe', titulo: 'RPE', ancho: 8, texto: true, otros: ['RIR / RPE', 'RPE / RIR', 'RIR'] },
  { clave: 'tempo', titulo: 'Tempo', ancho: 10, texto: true, otros: ['Cadencia'] },
  { clave: 'notas', titulo: 'Notas', ancho: 36, texto: true, otros: ['Indicaciones'] },
  { clave: 'datosMetodo', titulo: 'Datos del método', ancho: 30, texto: true },
  { clave: 'idEjercicio', titulo: 'ID ejercicio', ancho: 38, oculta: true },
  { clave: 'idFila', titulo: 'ID fila', ancho: 38, oculta: true },
]

export const COLUMNAS_CALENTAMIENTO = [
  { clave: 'dia', titulo: 'Día', ancho: 6 },
  { clave: 'orden', titulo: 'Orden', ancho: 7 },
  { clave: 'ejercicio', titulo: 'Ejercicio', ancho: 36 },
  { clave: 'series', titulo: 'Series', ancho: 8 },
  { clave: 'reps', titulo: 'Repeticiones', ancho: 13, texto: true, otros: ['Reps'] },
  { clave: 'kg', titulo: 'Peso (kg)', ancho: 10, otros: ['Peso', 'Kg'] },
  { clave: 'descanso', titulo: 'Descanso (s)', ancho: 12, texto: true, otros: ['Descanso'] },
  { clave: 'idEjercicio', titulo: 'ID ejercicio', ancho: 38, oculta: true },
]

export const COLUMNAS_ACTIVIDADES = [
  { clave: 'dia', titulo: 'Día', ancho: 6 },
  { clave: 'parte', titulo: 'Parte', ancho: 22, otros: ['Momento'] },
  { clave: 'actividad', titulo: 'Actividad', ancho: 26 },
  { clave: 'duracion', titulo: 'Duración', ancho: 14, texto: true },
  { clave: 'detalle', titulo: 'Detalle', ancho: 50, texto: true, otros: ['Ejercicios'] },
]

// Partes de la hoja Actividades → campo de la rutina.
export const PARTES_ACTIVIDADES = [
  {
    campo: 'calentamiento',
    nombre: 'Calentamiento previo',
    otros: ['Calentamiento', 'Entrada en calor'],
  },
  {
    campo: 'vuelta_calma',
    nombre: 'Vuelta a la calma',
    otros: ['Vuelta a la calma', 'Enfriamiento', 'Estiramientos'],
  },
]

// Datos de la hoja Configuración (un renglón por dato: nombre | valor).
export const DATOS_CONFIGURACION = {
  formato: 'Formato',
  version: 'Versión',
  cliente: 'Cliente',
  idCliente: 'ID cliente',
  semanas: 'Semanas',
  unidad: 'Unidad de peso',
  descargada: 'Descargada',
}

export function tituloDeSemana(numero) {
  return `SEMANA ${numero}`
}

// En "Detalle" de Actividades y "Datos del método", las partes se separan
// con " · " (también se aceptan ";" y renglones).
export const SEPARADOR = ' · '

// Cómo usar la planilla (arriba de la hoja Rutina).
export const INSTRUCCIONES = [
  'Hoja "Rutina": un renglón por cada día de entrenamiento (Día 1, Día 2...), con su nombre y datos generales.',
  'Hoja "Ejercicios": un renglón por ejercicio. Elegí el ejercicio de la lista (podés escribir para buscarlo) y cargá series, repeticiones y peso de cada semana.',
  'Semanas: lo que está en gris copia la semana anterior. Escribí un valor solo donde cambia (por ejemplo, el peso de la semana 3).',
  'Superseries y circuitos: poné la misma letra en "Bloque" (A1, A2) y elegí el "Tipo de bloque". Si el bloque queda vacío, el ejercicio va solo.',
  'Repeticiones: un número (10) o un rango (8-12). Peso vacío o "-": sin peso. Descanso en segundos (90) o rango (60-90).',
  'Hoja "Calentamiento" (opcional): las series de aproximación de cada ejercicio (Día, Orden y Ejercicio como en la hoja Ejercicios).',
  'Hoja "Actividades" (opcional): calentamiento previo y vuelta a la calma de cada día (cinta, movilidad, estiramientos...).',
  'No borres las columnas ocultas ni la hoja "Configuración": sirven para actualizar las rutinas sin duplicarlas.',
]
