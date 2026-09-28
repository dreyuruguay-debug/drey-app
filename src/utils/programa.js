import {
  agruparEnBloques,
  bloqueABorrador,
  borradorAPrescripcion,
  cambiosEntre,
  filasDeBloques,
  nuevoPlanSemanal,
} from './bloques.js'
import { MAXIMO_SEMANAS } from './semanas.js'

// El "programa" de un cliente: todas sus rutinas (una por día de
// entrenamiento) con las semanas del ciclo. Es el modelo en común entre la
// app y la planilla de Excel:
//
//   {
//     cliente: { id, nombre },
//     semanas: 4,                       // semanas del ciclo (1 = sin ciclo)
//     dias: [{
//       numero: 1,                      // Día 1, Día 2...
//       rutinaId,                       // la rutina de la app (null = nueva)
//       nombre, grupos, musculos, descripcion, pausaMin, pausaMax,
//       calentamiento, vueltaCalma,     // actividades (Cinta, Movilidad...)
//       bloques: [{ codigo: 'A', ...borrador }],
//     }],
//   }
//
// Cada bloque es EXACTAMENTE el borrador que edita el asistente de la app
// (utils/bloques.js: método, descanso y ejercicios con series, reps, kg,
// semanas, RPE, tempo, notas y series de calentamiento), y se guarda con
// la misma función (borradorAFilas). Así una rutina hecha a mano y una
// subida desde Excel terminan siendo el mismo objeto, y la planilla es
// solo otra forma de ver y editar este modelo:
//   rutinas de la app → programaDesdeRutinas → planilla (exportar)
//   planilla → programa (utils/importarPlanilla.js) → planDeGuardado → base
//
// Nada de este archivo lee ni guarda en la base de datos.

// A, B, C... Z, AA, AB...
export function codigoDeBloque(indice) {
  let codigo = ''
  let resto = indice
  do {
    codigo = String.fromCharCode(65 + (resto % 26)) + codigo
    resto = Math.floor(resto / 26) - 1
  } while (resto >= 0)
  return codigo
}

// Cuántas semanas conviene mostrar para estas rutinas: la más larga de
// sus ciclos (o "porDefecto" si ninguna tiene ciclo).
export function semanasDeRutinas(rutinas, porDefecto = 1) {
  const mayor = Math.max(0, ...rutinas.map(({ rutina }) => Number(rutina.ciclo_semanas) || 0))
  return Math.min(MAXIMO_SEMANAS, mayor || porDefecto)
}

// Rutinas de la app ([{ rutina, ejercicios }], en orden) → programa.
export function programaDesdeRutinas({ cliente, rutinas, semanas }) {
  return {
    cliente: { id: cliente?.id || null, nombre: cliente?.nombre || '' },
    semanas,
    dias: rutinas.map((datos, indice) => diaDesdeRutina(datos, indice + 1, semanas)),
  }
}

function diaDesdeRutina({ rutina, ejercicios }, numero, semanas) {
  return {
    numero,
    rutinaId: rutina.id || null,
    nombre: rutina.nombre || `Día ${numero}`,
    grupos: rutina.grupos_musculares || [],
    musculos: rutina.musculos || '',
    descripcion: rutina.descripcion || '',
    pausaMin: rutina.pausa_min ?? null,
    pausaMax: rutina.pausa_max ?? null,
    calentamiento: rutina.calentamiento || [],
    vueltaCalma: rutina.vuelta_calma || [],
    bloques: agruparEnBloques(ejercicios).map((bloque, indice) => ({
      ...bloqueABorrador(bloque, semanas),
      codigo: codigoDeBloque(indice),
    })),
  }
}

// Las semanas de un ejercicio del borrador, de la 1 a la "total":
// [{ series, reps, kg }]. Si sube lo mismo cada semana, se calcula; si
// cada semana es distinta, sale de su tabla (repitiendo la última si
// faltan semanas).
export function semanasDelEjercicio(item, total) {
  const primera = borradorAPrescripcion(item)
  if (!(total > 1)) return [primera]
  const plan = item.semanasPlan?.length
    ? Array.from(
        { length: total - 1 },
        (_, indice) => item.semanasPlan[Math.min(indice, item.semanasPlan.length - 1)],
      )
    : nuevoPlanSemanal(item, total)
  return [primera, ...plan.map(borradorAPrescripcion)]
}

// Datos generales de la rutina de un día (tabla "rutinas").
export function datosDeRutina(dia) {
  return {
    nombre: dia.nombre,
    grupos_musculares: dia.grupos || [],
    musculos: dia.musculos || null,
    descripcion: dia.descripcion || null,
    pausa_min: dia.pausaMin ?? null,
    pausa_max: dia.pausaMax ?? null,
    calentamiento: dia.calentamiento || [],
    vuelta_calma: dia.vueltaCalma || [],
  }
}

const CAMPOS_DATOS_A_COMPARAR = [
  'nombre',
  'grupos_musculares',
  'musculos',
  'descripcion',
  'pausa_min',
  'pausa_max',
  'calentamiento',
  'vuelta_calma',
  'ciclo_semanas',
]

// Qué hay que hacer en la base para cada día del programa (sin hacerlo):
// sirve para mostrar la revisión antes de importar y para guardar.
//   actuales: rutinas del cliente en la app ([{ rutina, ejercicios }]).
//   campos:   columnas de cada ejercicio (CAMPOS_EJERCICIO de services/rutinas.js).
//   hoy:      fecha de hoy (para el inicio del ciclo).
//   reiniciarCiclo: el ciclo vuelve a la semana 1 desde hoy.
// Devuelve una lista (un elemento por día):
//   { numero, nombre, accion: 'crear' | 'actualizar', rutinaId, datos,
//     filas, anteriores, cambios: { insertar, actualizar, borrar, iguales },
//     datosCambian, eraBorrador, ciclo: { antes, despues, inicioAntes, reinicia } }
export function planDeGuardado(programa, actuales, { campos, hoy, reiniciarCiclo = false }) {
  const porId = new Map(actuales.map((actual) => [actual.rutina.id, actual]))
  return programa.dias.map((dia) => {
    const actual = dia.rutinaId ? porId.get(dia.rutinaId) || null : null
    const anteriores = actual?.ejercicios || []
    const bloques = conFilasYGruposDeAntes(dia.bloques, anteriores)
    const filas = filasDeBloques(bloques)

    // El ciclo: si algo cambia de semana a semana, o si la rutina ya tenía
    // ciclo. Si todas las semanas son iguales y no tenía, queda sin ciclo
    // (así no aparece "ciclo terminado" en una rutina que no lo usa).
    const cambiaPorSemana = filas.some(
      (fila) => fila.semanas.length > 0 || Object.keys(fila.progresion).length > 0,
    )
    const conCiclo =
      programa.semanas > 1 && (cambiaPorSemana || Boolean(actual?.rutina.ciclo_semanas))
    const reinicia = conCiclo && (reiniciarCiclo || !actual?.rutina.ciclo_inicio)
    const datos = {
      ...datosDeRutina(dia),
      ciclo_semanas: conCiclo ? programa.semanas : null,
      ciclo_inicio: conCiclo ? (reinicia ? hoy : actual.rutina.ciclo_inicio) : null,
      publicada: true,
    }

    const { insertar, actualizar, borrar } = cambiosEntre(anteriores, filas, campos)
    const conId = filas.filter((fila) => fila.id).length
    return {
      numero: dia.numero,
      nombre: dia.nombre,
      accion: actual ? 'actualizar' : 'crear',
      rutinaId: actual?.rutina.id || null,
      datos,
      filas,
      anteriores,
      cambios: {
        insertar: insertar.length,
        actualizar: actualizar.length,
        borrar: borrar.length,
        iguales: conId - actualizar.length,
      },
      datosCambian: actual
        ? CAMPOS_DATOS_A_COMPARAR.some(
            (campo) =>
              JSON.stringify(actual.rutina[campo] ?? null) !== JSON.stringify(datos[campo] ?? null),
          ) || actual.rutina.publicada === false
        : true,
      eraBorrador: actual?.rutina.publicada === false,
      ciclo: {
        antes: actual?.rutina.ciclo_semanas || null,
        despues: datos.ciclo_semanas,
        inicioAntes: actual?.rutina.ciclo_inicio || null,
        reinicia: Boolean(actual) && reinicia && Boolean(actual.rutina.ciclo_inicio),
      },
    }
  })
}

// Deja en cada ejercicio el id de su fila solo si es de ESTA rutina (si
// no, se guarda como fila nueva) y a cada bloque le devuelve su "grupo" de
// antes cuando sigue siendo el mismo bloque (así una planilla sin cambios
// no cambia nada en la base).
function conFilasYGruposDeAntes(bloques, anteriores) {
  const anterioresPorId = new Map(anteriores.map((fila) => [fila.id, fila]))
  const gruposUsados = new Set()
  return bloques.map((bloque) => {
    const ejercicios = bloque.ejercicios.map((item) =>
      item.id && anterioresPorId.has(item.id) ? item : { ...item, id: undefined },
    )
    const gruposDeAntes = new Set(
      ejercicios.map((item) => (item.id ? anterioresPorId.get(item.id).grupo || null : null)),
    )
    const [grupo] = gruposDeAntes
    const mismoGrupo = gruposDeAntes.size === 1 && grupo && !gruposUsados.has(grupo)
    if (mismoGrupo) gruposUsados.add(grupo)
    return { ...bloque, ejercicios, grupo: mismoGrupo ? grupo : null }
  })
}
