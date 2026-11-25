// Pruebas de lo nuevo del alumno (la racha de semanas) y de cómo arranca
// la pantalla de entrenar.
import { describe, expect, it } from 'vitest'
import { calcularRacha, diasConRutina, sumarDias } from '../src/utils/dias.js'
import { RECORD_PESO, RECORD_REPS, RECORD_TONELAJE } from '../src/utils/records.js'
import { prepararEntrenamiento } from '../src/utils/pantallaEntrenar.js'

// Martes 24/11/2026: la semana empieza el lunes 23.
const HOY = '2026-11-24'
const LUNES = '2026-11-23'
function semana(atras, dias) {
  const lunes = sumarDias(LUNES, -7 * atras)
  return dias.map((dia) => sumarDias(lunes, dia))
}

describe('racha de semanas', () => {
  it('cuenta las semanas en que cumplió los días de su rutina', () => {
    // 3 días por semana, las últimas 4 semanas completas; esta, 1 de 3.
    const fechas = [1, 2, 3, 4].flatMap((atras) => semana(atras, [0, 2, 4])).concat(semana(0, [0]))
    const racha = calcularRacha(fechas, 3, HOY)
    expect(racha.semanas).toBe(4)
    expect(racha.estaSemana).toBe(1)
    expect(racha.faltan).toBe(2)
    expect(racha.completaEstaSemana).toBe(false)
  })

  it('una semana con menos días que la rutina corta la racha', () => {
    const fechas = [...semana(1, [0, 2, 4]), ...semana(2, [0]), ...semana(3, [0, 2, 4])]
    const racha = calcularRacha(fechas, 3, HOY)
    expect(racha.semanas).toBe(1)
    expect(racha.mejor).toBe(1)
  })

  it('entrenar dos veces el mismo día cuenta como un día', () => {
    const fechas = [...semana(1, [0, 0, 0])]
    expect(calcularRacha(fechas, 2, HOY).semanas).toBe(0)
  })

  it('si completa esta semana, ya suma', () => {
    const fechas = [...semana(1, [0, 1]), ...semana(0, [0, 1])]
    const racha = calcularRacha(fechas, 2, HOY)
    expect(racha.semanas).toBe(2)
    expect(racha.completaEstaSemana).toBe(true)
  })

  it('sin días asignados alcanza con entrenar una vez', () => {
    expect(calcularRacha(semana(1, [3]), 0, HOY).semanas).toBe(1)
    expect(calcularRacha([], 3, HOY)).toMatchObject({ semanas: 0, mejor: 0, faltan: 3 })
  })

  it('recuerda la mejor racha', () => {
    const fechas = [5, 6, 7].flatMap((atras) => semana(atras, [0])).concat(semana(1, [0]))
    const racha = calcularRacha(fechas, 1, HOY)
    expect(racha.semanas).toBe(1)
    expect(racha.mejor).toBe(3)
  })

  it('cuenta los días con rutina del calendario', () => {
    expect(
      diasConRutina({
        Lunes: { rutina_id: 'a' },
        Martes: { rutina_id: null },
        Jueves: { rutina_id: 'b' },
      }),
    ).toBe(2)
    expect(diasConRutina(null)).toBe(0)
  })
})

describe('pantalla de entrenar: cómo arranca', () => {
  const datos = { id: 'r1', nombre: 'Día 1', calentamiento: [] }
  const ejercicios = [
    {
      id: 'f1',
      ejercicio_id: 'e1',
      orden: 1,
      series: 3,
      reps_objetivo: '10',
      kg_objetivo: 40,
      ejercicios: { nombre: 'Sentadilla' },
    },
  ]
  const historial = [
    {
      id: 's1',
      rutina_id: 'r1',
      fecha: '2026-11-16',
      detalle: [{ ejercicio_id: 'e1', series: [{ kg: 50, reps: 10 }] }],
    },
  ]
  const comun = {
    datos,
    ejerciciosGuardados: ejercicios,
    historialSesiones: historial,
    rutinaId: 'r1',
    hoy: HOY,
    ahora: 1000,
  }

  it('arranca de cero con la vez pasada y las marcas', () => {
    const inicio = prepararEntrenamiento(comun)
    expect(inicio.retomado).toBe(false)
    expect(inicio.series[0]).toHaveLength(3)
    expect(inicio.anteriores.e1).toEqual([{ kg: 50, reps: 10 }])
    expect(inicio.mejores.e1.kg).toBe(50)
    expect(inicio.estadoInicial).not.toBeNull()
  })

  it('retoma un entrenamiento a medias con sus récords', () => {
    const primero = prepararEntrenamiento(comun)
    const series = primero.series.map((filas) =>
      filas.map((fila, i) => (i === 0 ? { ...fila, kg: 55, reps: 10, hecha: true } : fila)),
    )
    const enCurso = {
      series,
      calentamiento: null,
      reloj: { acumulado: 300, desde: null },
      pausa: { desde: 500 },
      visible: 0,
      records: 1,
      logros: [
        { ejercicioId: 'e1', nombre: 'Sentadilla', tipo: RECORD_PESO, valor: 55, kg: 55, reps: 10 },
      ],
      fase: 'entrenando',
    }
    const inicio = prepararEntrenamiento({ ...comun, enCurso })
    expect(inicio.retomado).toBe(true)
    expect(inicio.records).toBe(1)
    expect(inicio.mejores.e1.kg).toBe(55) // lo de hoy ya cuenta como marca
    expect(inicio.estadoInicial).toBeNull()
  })

  it('el profe mirando no ve historial ni lo guardado', () => {
    const inicio = prepararEntrenamiento({ ...comun, modoPrevia: true, enCurso: { series: [] } })
    expect(inicio.retomado).toBe(false)
    expect(inicio.anteriores).toEqual({})
  })
})
