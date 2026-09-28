import { METODOS, nombreCortoDeMetodo, obtenerMetodo } from '../data/metodos.js'
import { NOMBRES_GRUPOS_MUSCULARES, textoGrupos } from '../data/gruposMusculares.js'
import {
  DATOS_CONFIGURACION,
  FORMATO_PLANILLA,
  MAXIMO_DIAS,
  PARTES_ACTIVIDADES,
  SEPARADOR,
  VERSION_PLANILLA,
} from '../data/planillaExcel.js'
import { estaArchivado } from './biblioteca.js'
import { separarReps } from './formatos.js'
import { semanasDelEjercicio } from './programa.js'
import { borradorACalentamiento } from './seriesCalentamiento.js'

// Programa (utils/programa.js) → el contenido de cada hoja de la
// planilla oficial (data/planillaExcel.js), como valores simples. Cómo se
// ve (colores, listas desplegables, fórmulas) lo decide
// services/planillaExcel.js. Nada de este archivo lee ni guarda nada.

// Renglones vacíos (con el Día ya puesto) debajo de cada día, para sumar
// ejercicios sin tener que insertar filas.
const VACIAS_POR_DIA = 2
const VACIAS_POR_DIA_NUEVO = 8

// programa: el programa a exportar. biblioteca: todos los ejercicios.
// fecha: Date de la descarga.
export function contenidoDePlanilla(programa, biblioteca, fecha = new Date()) {
  const semanas = Math.max(1, programa.semanas || 1)
  return {
    semanas,
    cliente: programa.cliente,
    dias: programa.dias.map(filaDeDia),
    ejercicios: filasDeEjercicios(programa, semanas),
    calentamiento: filasDeCalentamiento(programa),
    actividades: filasDeActividades(programa),
    configuracion: datosDeConfiguracion(programa, semanas, fecha),
    listas: listasDePlanilla(programa, biblioteca),
  }
}

// Programa vacío para armar desde cero: "cantidadDias" días sin ejercicios.
export function programaVacio(cliente, cantidadDias, semanas) {
  return {
    cliente: { id: cliente?.id || null, nombre: cliente?.nombre || '' },
    semanas,
    dias: Array.from({ length: cantidadDias }, (_, indice) => ({
      numero: indice + 1,
      rutinaId: null,
      nombre: `Día ${indice + 1}`,
      grupos: [],
      musculos: '',
      descripcion: '',
      pausaMin: null,
      pausaMax: null,
      calentamiento: [],
      vueltaCalma: [],
      bloques: [],
    })),
  }
}

function filaDeDia(dia) {
  return {
    dia: dia.numero,
    nombre: dia.nombre,
    grupos: dia.grupos?.length ? textoGrupos(dia.grupos) : dia.musculos || '',
    descripcion: dia.descripcion || '',
    pausa: valorDeRango(dia.pausaMin, dia.pausaMax),
    idRutina: dia.rutinaId || '',
  }
}

// Un renglón por ejercicio: { dia, orden, bloque, tipo, ejercicio,
// idEjercicio, semanas: [{ series, reps, kg }], descanso, rpe, tempo,
// notas, datosMetodo, idFila }. Los renglones vacíos solo traen día y orden.
function filasDeEjercicios(programa, semanas) {
  const filas = []
  for (const dia of programa.dias) {
    let orden = 0
    for (const bloque of dia.bloques) {
      const varios = bloque.ejercicios.length > 1
      bloque.ejercicios.forEach((item, posicion) => {
        orden += 1
        const ultimo = posicion === bloque.ejercicios.length - 1
        filas.push({
          dia: dia.numero,
          orden,
          bloque: varios ? `${bloque.codigo}${posicion + 1}` : bloque.codigo,
          tipo: nombreCortoDeMetodo(bloque.metodo),
          ejercicio: item.ejercicio?.nombre || '',
          idEjercicio: item.ejercicio?.id || '',
          semanas: semanasDelEjercicio(item, semanas).map(valoresDeSemana),
          // En un bloque de varios ejercicios, el descanso va al final (es
          // el descanso al terminar la vuelta).
          descanso: ultimo ? valorDeRango(bloque.descansoMin, bloque.descansoMax) : '',
          rpe: item.rpe ?? '',
          tempo: item.tempo ?? '',
          notas: item.notas ?? '',
          datosMetodo: posicion === 0 ? textoDatosDelMetodo(bloque.metodo, bloque.config) : '',
          idFila: item.id || '',
        })
      })
    }
    const vacias = dia.bloques.length ? VACIAS_POR_DIA : VACIAS_POR_DIA_NUEVO
    for (let i = 0; i < vacias; i++) {
      orden += 1
      filas.push({ dia: dia.numero, orden, vacia: true })
    }
  }
  return filas
}

// Una semana → valores para la planilla: reps "10" (número) o "8-12"
// (texto, con guion común, como lo escribe el profe); kg número o vacío.
function valoresDeSemana(prescripcion) {
  const { desde, hasta } = separarReps(prescripcion.reps)
  let reps = prescripcion.reps || ''
  if (desde !== '') reps = hasta !== '' && hasta !== desde ? `${desde}-${hasta}` : desde
  return { series: prescripcion.series ?? '', reps, kg: prescripcion.kg ?? '' }
}

// "Rondas: 3 · Pausa entre ejercicios (seg): 15" con los datos del método.
export function textoDatosDelMetodo(metodoId, config = {}) {
  return obtenerMetodo(metodoId)
    .campos.filter((campo) => config?.[campo.clave] !== undefined && config[campo.clave] !== '')
    .map((campo) => `${campo.etiqueta}: ${config[campo.clave]}`)
    .join(SEPARADOR)
}

// Una fila por serie de calentamiento; las iguales seguidas se juntan
// ("2 series de 10 con 40").
function filasDeCalentamiento(programa) {
  const filas = []
  for (const dia of programa.dias) {
    let orden = 0
    for (const bloque of dia.bloques) {
      for (const item of bloque.ejercicios) {
        orden += 1
        const calentamiento = borradorACalentamiento(item)
        if (!calentamiento) continue
        const grupos = []
        for (const serie of calentamiento.series) {
          const ultimo = grupos[grupos.length - 1]
          if (ultimo && ultimo.reps === serie.reps && ultimo.kg === serie.kg) ultimo.series++
          else grupos.push({ ...serie, series: 1 })
        }
        for (const grupo of grupos) {
          filas.push({
            dia: dia.numero,
            orden,
            ejercicio: item.ejercicio?.nombre || '',
            idEjercicio: item.ejercicio?.id || '',
            series: grupo.series,
            reps: grupo.reps,
            kg: grupo.kg ?? '',
            descanso: calentamiento.descanso,
          })
        }
      }
    }
  }
  return filas
}

function filasDeActividades(programa) {
  const filas = []
  for (const dia of programa.dias) {
    for (const parte of PARTES_ACTIVIDADES) {
      const lista = parte.campo === 'calentamiento' ? dia.calentamiento : dia.vueltaCalma
      for (const actividad of lista || []) {
        filas.push({
          dia: dia.numero,
          parte: parte.nombre,
          actividad: actividad.nombre || '',
          duracion: actividad.duracion || '',
          detalle: (actividad.items || []).join(SEPARADOR),
        })
      }
    }
  }
  return filas
}

function datosDeConfiguracion(programa, semanas, fecha) {
  return [
    [DATOS_CONFIGURACION.formato, FORMATO_PLANILLA],
    [DATOS_CONFIGURACION.version, VERSION_PLANILLA],
    [DATOS_CONFIGURACION.cliente, programa.cliente?.nombre || ''],
    [DATOS_CONFIGURACION.idCliente, programa.cliente?.id || ''],
    [DATOS_CONFIGURACION.semanas, semanas],
    [DATOS_CONFIGURACION.unidad, 'kg'],
    [DATOS_CONFIGURACION.descargada, fecha.toLocaleDateString('es-UY')],
  ]
}

// Opciones de las listas desplegables. Los ejercicios: primero los de la
// biblioteca en uso (los que se ofrecen en la lista), después los
// archivados que están en estas rutinas (para que su ID se encuentre).
function listasDePlanilla(programa, biblioteca) {
  const activos = biblioteca
    .filter((ejercicio) => !estaArchivado(ejercicio))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const usados = new Set(
    programa.dias.flatMap((dia) =>
      dia.bloques.flatMap((bloque) => bloque.ejercicios.map((item) => item.ejercicio?.id)),
    ),
  )
  const archivadosEnUso = biblioteca.filter(
    (ejercicio) => estaArchivado(ejercicio) && usados.has(ejercicio.id),
  )
  return {
    ejercicios: [...activos, ...archivadosEnUso].map((ejercicio) => ({
      id: ejercicio.id,
      nombre: ejercicio.nombre,
      grupo: ejercicio.grupo_muscular || '',
    })),
    cantidadActivos: activos.length,
    tipos: METODOS.map((metodo) => nombreCortoDeMetodo(metodo.id)),
    dias: Array.from({ length: MAXIMO_DIAS }, (_, indice) => indice + 1),
    bloques: codigosDeBloque(),
    partes: PARTES_ACTIVIDADES.map((parte) => parte.nombre),
    grupos: NOMBRES_GRUPOS_MUSCULARES,
  }
}

// A, A1, A2... A5, B, B1... (para la lista desplegable de "Bloque").
function codigosDeBloque() {
  const codigos = []
  for (const letra of 'ABCDEFGHIJKL') {
    codigos.push(letra)
    for (let numero = 1; numero <= 5; numero++) codigos.push(`${letra}${numero}`)
  }
  return codigos
}

// Ayuda de la hoja Configuración: cada tipo de bloque, cuántos ejercicios
// lleva, sus datos y qué es.
export function ayudaDeTiposDeBloque() {
  return METODOS.map((metodo) => ({
    tipo: nombreCortoDeMetodo(metodo.id),
    ejercicios: metodo.resumen,
    datos: metodo.campos.map((campo) => campo.etiqueta).join(SEPARADOR),
    explicacion: metodo.explicacion,
  }))
}

// 90 → 90 · 60 y 90 → "60-90" · nada → ''.
function valorDeRango(minimo, maximo) {
  const min = minimo === '' || minimo === null || minimo === undefined ? null : Number(minimo)
  const max = maximo === '' || maximo === null || maximo === undefined ? null : Number(maximo)
  if (min === null && max === null) return ''
  if (min === null || max === null || min === max) return min ?? max
  return `${min}-${max}`
}
