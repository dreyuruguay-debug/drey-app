// Pruebas de los cálculos del día a día: descansos, reloj, textos de
// repeticiones y descansos, cupos y récords. Si alguien cambia una de
// estas cuentas sin querer, la prueba avisa antes de subir la app.
import { describe, expect, it } from 'vitest'
import {
  cambiarDuracion,
  empezarDescanso,
  segundosRestantes,
  sumarAlDescanso,
} from '../src/utils/descanso.js'
import {
  pausarReloj,
  reanudarReloj,
  relojEnMarcha,
  relojParado,
  segundosDeReloj,
} from '../src/utils/reloj.js'
import {
  opcionesDeDescanso,
  separarReps,
  textoDescanso,
  textoRango,
  textoReps,
} from '../src/utils/formatos.js'
import { porcentajeCupos, problemaDeCupo, textoCupos } from '../src/utils/cupos.js'
import {
  RECORD_PESO,
  RECORD_REPS,
  RECORD_SEGUNDOS,
  RECORD_TONELAJE,
  esRecordDeTiempo,
  mejorTiempoDeRutina,
  mejoresMarcas,
  recordDeSerie,
} from '../src/utils/records.js'

const T0 = 1_000_000

describe('descanso entre series', () => {
  it('cuenta para atrás contra la hora (no se atrasa si se bloquea la pantalla)', () => {
    const descanso = empezarDescanso(90, T0, { titulo: 'Descansá' })
    expect(descanso.titulo).toBe('Descansá')
    expect(segundosRestantes(descanso, T0)).toBe(90)
    expect(segundosRestantes(descanso, T0 + 30_500)).toBe(60)
    expect(segundosRestantes(descanso, T0 + 200_000)).toBe(0)
    expect(segundosRestantes(null, T0)).toBe(0)
  })

  it('+15 s y cambiar de 60 a 90 s no reinician el reloj', () => {
    const descanso = empezarDescanso(60, T0)
    expect(segundosRestantes(sumarAlDescanso(descanso, 15), T0 + 10_000)).toBe(65)
    const masLargo = cambiarDuracion(descanso, 90)
    expect(masLargo.total).toBe(90)
    expect(segundosRestantes(masLargo, T0 + 60_000)).toBe(30)
  })
})

describe('reloj del entrenamiento', () => {
  it('suma solo el tiempo en marcha', () => {
    expect(segundosDeReloj(relojParado(), T0)).toBe(0)
    let reloj = relojEnMarcha(T0)
    expect(segundosDeReloj(reloj, T0 + 10_000)).toBe(10)
    reloj = pausarReloj(reloj, T0 + 10_000)
    expect(segundosDeReloj(reloj, T0 + 99_000)).toBe(10)
    reloj = reanudarReloj(reloj, T0 + 100_000)
    expect(segundosDeReloj(reloj, T0 + 105_000)).toBe(15)
  })
})

describe('textos de repeticiones y descansos', () => {
  it('arma y separa rangos', () => {
    expect(textoReps(8, 12)).toBe('8–12')
    expect(textoReps(10, 10)).toBe('10')
    expect(textoReps('', '')).toBe('')
    expect(separarReps('8-12')).toEqual({ desde: 8, hasta: 12 })
    expect(separarReps('8 a 12')).toEqual({ desde: 8, hasta: 12 })
    expect(separarReps('10')).toEqual({ desde: 10, hasta: '' })
    expect(textoRango(60, 90)).toBe('60–90 s')
    expect(textoRango(60, 60)).toBe('60 s')
  })

  it('ofrece opciones de descanso dentro del rango del profe', () => {
    expect(opcionesDeDescanso(60, 90)).toEqual([60, 75, 90])
    expect(opcionesDeDescanso(90, 90)).toEqual([90])
    expect(opcionesDeDescanso('', '')).toEqual([])
    expect(opcionesDeDescanso(60, 180).length).toBeLessThanOrEqual(5)
    expect(textoDescanso({ descansos: [60, 90, 120] })).toBe('60–120 s')
  })
})

describe('cupos de alumnos', () => {
  it('muestra los cupos y el porcentaje usado', () => {
    expect(textoCupos({ total: 25, usados: 12 })).toBe('12 de 25 alumnos')
    expect(textoCupos({ total: null, usados: 1 })).toBe('1 alumno · sin tope')
    expect(porcentajeCupos({ total: 20, usados: 5 })).toBe(25)
    expect(porcentajeCupos({ total: 10, usados: 30 })).toBe(100)
    expect(porcentajeCupos({ total: null, usados: 3 })).toBeNull()
  })

  it('explica el error de cupo lleno de la base', () => {
    const problema = problemaDeCupo({ message: 'Cupo lleno: 25 de 25' })
    expect(problema.motivo).toBe('cupo')
    expect(problema.texto).toContain('25 de 25')
    expect(problemaDeCupo({ message: 'otra cosa' })).toBeNull()
  })
})

describe('récords', () => {
  const sesiones = [
    {
      id: 'a',
      rutina_id: 'r1',
      duracion_seg: 3000,
      detalle: [
        {
          ejercicio_id: 'banca',
          series: [
            { kg: 60, reps: 8 },
            { kg: 62.5, reps: 6 },
          ],
        },
      ],
    },
    {
      id: 'b',
      rutina_id: 'r1',
      duracion_seg: 2800,
      detalle: [
        {
          ejercicio_id: 'banca',
          series: [
            { kg: 60, reps: 10 },
            { kg: 0, reps: 0, hecha: false },
          ],
        },
      ],
    },
    {
      id: 'c',
      rutina_id: 'r1',
      duracion_seg: 2700,
      detalle: [{ ejercicio_id: 'banca', series: [{ kg: 50, reps: 10 }] }],
    },
  ]

  it('guarda la mejor marca de cada ejercicio', () => {
    expect(mejoresMarcas(sesiones).banca).toEqual({ kg: 62.5, tonelaje: 600, cantidad: 10 })
  })

  it('reconoce récord de peso, de tonelaje, de repeticiones y de tiempo', () => {
    const marca = mejoresMarcas(sesiones).banca
    expect(recordDeSerie(marca, { kg: 65, reps: 3 })).toEqual({ tipo: RECORD_PESO, valor: 65 })
    expect(recordDeSerie(marca, { kg: 62.5, reps: 10 })).toEqual({
      tipo: RECORD_TONELAJE,
      valor: 625,
    })
    expect(recordDeSerie(marca, { kg: 50, reps: 5 })).toBeNull()
    expect(recordDeSerie(undefined, { kg: 50, reps: 5 })).toBeNull() // primera vez: no es récord
    expect(recordDeSerie({ kg: 0, tonelaje: 0, cantidad: 12 }, { kg: 0, reps: 15 })).toEqual({
      tipo: RECORD_REPS,
      valor: 15,
    })
    expect(recordDeSerie({ kg: 0, tonelaje: 0, cantidad: 30 }, { kg: 0, reps: 45 }, true)).toEqual({
      tipo: RECORD_SEGUNDOS,
      valor: 45,
    })
  })

  it('el récord de tiempo cuenta solo entrenamientos completos', () => {
    // "b" tiene una serie sin hacer: no participa.
    expect(mejorTiempoDeRutina(sesiones, 'r1')).toBe(2700)
    expect(mejorTiempoDeRutina(sesiones, 'r1', 'c')).toBe(3000)
    expect(esRecordDeTiempo(2600, 2700, true)).toBe(true)
    expect(esRecordDeTiempo(2600, 2700, false)).toBe(false)
    expect(esRecordDeTiempo(2600, null, true)).toBe(false)
  })
})
