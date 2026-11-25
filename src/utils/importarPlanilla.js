import { HOJAS } from '../data/planillaExcel.js'
import { armarPrograma } from './importarPlanilla/armarPrograma.js'
import { indexarBiblioteca, resolverEjercicios } from './importarPlanilla/biblioteca.js'
import { leerActividades, leerCalentamientos } from './importarPlanilla/hojaActividades.js'
import { leerEjercicios } from './importarPlanilla/hojaEjercicios.js'
import { leerConfiguracion, leerDias } from './importarPlanilla/hojaRutina.js'
import { buscarHoja } from './importarPlanilla/hojas.js'
import { crearInforme } from './importarPlanilla/informe.js'

// Lee la planilla oficial (ya abierta por services/planillaExcel.js) y
// arma el programa (utils/programa.js) revisando cada celda. No guarda
// nada: devuelve lo que entendió y un informe para el profe.
//
//   libro: { hojas: [{ nombre, filas: [{ numero, celdas: [valor, ...] }] }] }
//          (numero = renglón de Excel; celdas[0] = columna A)
//   contexto: {
//     biblioteca,        // todos los ejercicios
//     cliente,           // { id, nombre } del cliente al que se sube
//     actuales,          // sus rutinas en la app: [{ rutina, ejercicios }]
//     resoluciones,      // ejercicios que no estaban, ya resueltos por el
//                        // profe: { clave: { tipo: 'vincular', ejercicioId }
//                        //                | { tipo: 'crear', categoria } }
//     destinos,          // días sin rutina: { numero: rutinaId | 'nueva' }
//   }
//
// Devuelve { programa, errores, advertencias, desconocidos, archivo, destinos }
//   errores:      impiden importar (hay que corregir la planilla)
//   advertencias: se pueden aceptar (la app ya decidió qué hacer)
//   cada uno: { hoja, fila, celda, texto }  (celda: "Ejercicios!F18")
//   desconocidos: ejercicios que no están en la biblioteca (o hay varios
//     con ese nombre) y el profe tiene que elegir qué hacer:
//     [{ clave, nombre, filas, motivo: 'no-existe' | 'ambiguo', opciones }]
//   destinos: para cada día nuevo, qué rutina se propone reemplazar
//     (misma nombre) o 'nueva'.
//
// Las partes de la lectura están en utils/importarPlanilla/ (una por hoja
// de la planilla, más las celdas, la biblioteca y el armado final). Acá
// queda solo el recorrido general.
//
// Regla general: un error en una celda no frena el resto; se revisa todo y
// se informa cada problema con su hoja, fila y columna.

export function analizarPlanilla(libro, contexto) {
  const informe = crearInforme()
  const biblioteca = indexarBiblioteca(contexto.biblioteca || [])
  const hojaEjercicios = buscarHoja(libro, HOJAS.ejercicios)

  if (!hojaEjercicios) {
    informe.error(
      {},
      `Este archivo no es la planilla de DREY: no tiene la hoja "${HOJAS.ejercicios}". Descargá la planilla desde esta pantalla y armá ahí las rutinas.`,
    )
    return resultado(informe, null)
  }

  const archivo = leerConfiguracion(buscarHoja(libro, HOJAS.configuracion), informe, contexto)
  const hojaRutina = buscarHoja(libro, HOJAS.rutina)
  const hojaCalentamiento = buscarHoja(libro, HOJAS.calentamiento)
  const hojaActividades = buscarHoja(libro, HOJAS.actividades)

  const dias = leerDias(hojaRutina, informe)
  const tabla = leerEjercicios(hojaEjercicios, informe)
  if (!tabla) return resultado(informe, null, archivo)

  const calentamientos = hojaCalentamiento ? leerCalentamientos(hojaCalentamiento, informe) : null
  const actividades = hojaActividades ? leerActividades(hojaActividades, informe) : null
  const desconocidos = resolverEjercicios(
    tabla.filas,
    biblioteca,
    contexto.resoluciones || {},
    informe,
  )

  const { programa, destinos } = armarPrograma({
    tabla,
    dias,
    calentamientos,
    actividades,
    archivo,
    contexto,
    informe,
    hayHojaRutina: Boolean(hojaRutina),
  })
  return { ...resultado(informe, programa, archivo), desconocidos, destinos }
}

function resultado(informe, programa, archivo = null) {
  return {
    programa,
    errores: informe.ordenados(informe.errores),
    advertencias: informe.ordenados(informe.advertencias),
    desconocidos: [],
    archivo,
    destinos: {},
  }
}

// Lo que usan otras pantallas.
export { letraDeColumna } from './importarPlanilla/informe.js'
export { metodoDesdeTexto } from './importarPlanilla/hojaEjercicios.js'
export { parecidos } from './importarPlanilla/biblioteca.js'
