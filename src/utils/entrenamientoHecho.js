import { etiquetaDeSerie, valorDeSerieValido } from './entrenamiento.js'
import { TIPO_CALENTAMIENTO, TIPO_EFECTIVA } from './seriesCalentamiento.js'

// Un entrenamiento YA GUARDADO (una fila de la tabla "sesiones") y cómo
// se corrige. El alumno y el profe pueden cambiar el peso, las
// repeticiones y si llegó al fallo en cada serie, si quedó algo mal
// anotado; nada más.
//
// "detalle" es lo que se guardó al terminar (ver finalizar en
// pages/RutinaDetalle.jsx): una fila por ejercicio,
//   { ejercicio_id, nombre, metodo, series: [{ kg, reps, hecha, fallo }],
//     calentamiento: [{ kg, reps, hecha }] }   (calentamiento es opcional)
// "fallo: true" está solo en las series efectivas que llegaron al fallo
// (los entrenamientos de antes no lo tienen: cuentan como sin fallo).
// Las efectivas van en "series" (de ahí salen los récords y las
// gráficas) y las de calentamiento aparte, en "calentamiento".
//
// Nada de este archivo lee ni guarda en la base de datos.

// Las dos listas de series de un ejercicio guardado, en el orden en que
// se hicieron, con el tipo que usa el modo entrenar.
const LISTAS = [
  { lista: 'calentamiento', tipo: TIPO_CALENTAMIENTO },
  { lista: 'series', tipo: TIPO_EFECTIVA },
]

// Las series de un ejercicio guardado, listas para mostrar: primero las
// de calentamiento y después las efectivas.
//   [{ lista, indice, kg, reps, hecha, fallo, calentamiento, texto }]
//   lista + indice: dónde está guardada (para corregirDetalle).
//   texto: "Calentamiento 1", "Serie 2"...
// Los entrenamientos más viejos no guardaban "hecha": cuentan como hechas.
export function seriesGuardadas(item) {
  const filas = LISTAS.flatMap(({ lista, tipo }) =>
    (Array.isArray(item?.[lista]) ? item[lista] : []).map((serie, indice) => ({
      lista,
      indice,
      tipo,
      kg: Number(serie?.kg) || 0,
      reps: Number(serie?.reps) || 0,
      hecha: serie?.hecha !== false,
      fallo: serie?.fallo === true,
    })),
  )
  return filas.map((fila, posicion) => {
    const etiqueta = etiquetaDeSerie(filas, posicion)
    return { ...fila, calentamiento: etiqueta.calentamiento, texto: etiqueta.texto }
  })
}

// El detalle con el peso ("kg"), las repeticiones ("reps") o el fallo
// ("fallo": true / false) de una serie cambiados. No toca nada más: ni las
// otras series, ni si estaba hecha, ni los demás datos del ejercicio. El
// fallo solo se cambia en las series efectivas ("series"). Devuelve una
// copia.
export function corregirDetalle(detalle, ejercicioIndex, lista, serieIndex, campo, valor) {
  if (campo === 'fallo' && lista !== 'series') return detalle
  return (detalle || []).map((item, i) => {
    if (i !== ejercicioIndex || !Array.isArray(item?.[lista])) return item
    return {
      ...item,
      [lista]: item[lista].map((serie, j) =>
        j === serieIndex ? serieCorregida(serie, campo, valor) : serie,
      ),
    }
  })
}

function serieCorregida(serie, campo, valor) {
  if (campo !== 'fallo') return { ...serie, [campo]: valorDeSerieValido(campo, valor) }
  // "fallo" se guarda solo cuando es true (igual que al entrenar).
  const { fallo: _anterior, ...resto } = serie || {}
  return valor ? { ...resto, fallo: true } : resto
}

// true si los dos detalles tienen los mismos pesos, repeticiones y fallos
// (para saber si hay algo para guardar).
export function mismoDetalle(uno, otro) {
  const numeros = (detalle) =>
    JSON.stringify(
      (detalle || []).map((item) =>
        seriesGuardadas(item).map((serie) => [serie.lista, serie.kg, serie.reps, serie.fallo]),
      ),
    )
  return numeros(uno) === numeros(otro)
}

// Lo que se muestra de un entrenamiento en una lista: cuántos ejercicios
// tuvo, cuántas series efectivas hizo y cuántas de ellas al fallo.
export function resumenDeEntrenamiento(sesion) {
  const detalle = Array.isArray(sesion?.detalle) ? sesion.detalle : []
  let series = 0
  let alFallo = 0
  for (const item of detalle) {
    for (const serie of seriesGuardadas(item)) {
      if (!serie.hecha || serie.calentamiento) continue
      series++
      if (serie.fallo) alFallo++
    }
  }
  return { ejercicios: detalle.length, series, alFallo }
}

// "6 ejercicios · 22 series · 3 al fallo" (o "Sin series anotadas").
export function textoDeEntrenamiento(sesion) {
  const { ejercicios, series, alFallo } = resumenDeEntrenamiento(sesion)
  if (!ejercicios) return 'Sin series anotadas'
  const texto = `${ejercicios} ${ejercicios === 1 ? 'ejercicio' : 'ejercicios'} · ${series} ${
    series === 1 ? 'serie' : 'series'
  }`
  return alFallo ? `${texto} · ${alFallo} al fallo` : texto
}
