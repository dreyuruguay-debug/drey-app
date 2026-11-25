// Pruebas de lo nuevo del alumno (la racha de semanas, los avisos del
// Inicio) y de cómo arranca la pantalla de entrenar.
import { describe, expect, it } from 'vitest'
import { calcularRacha, diasConRutina, sumarDias } from '../src/utils/dias.js'
import { RECORD_PESO, RECORD_REPS, RECORD_TONELAJE } from '../src/utils/records.js'
import { prepararEntrenamiento } from '../src/utils/pantallaEntrenar.js'
import { armarAvisosInicio, avisosVisibles, HORAS_SILENCIO } from '../src/utils/avisosInicio.js'
import { filtrarPorPeriodo } from '../src/utils/progreso.js'

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

// Avisos del Inicio (carrusel y campanita, utils/avisosInicio.js).
describe('avisos del Inicio', () => {
  const base = {
    perfil: { profe_id: 'p1', vencimiento: '2026-11-20' },
    plan: { tipo: 'al-dia' },
    cuentaPendiente: false,
    cuentaDeBaja: false,
    planBloqueado: false,
    cartelDelEspacio: false,
    textoEspacio: '',
    avanceNuevo: false,
    tocaMedidas: false,
    ultimaMedicion: null,
  }

  it('sin nada pendiente no hay avisos', () => {
    expect(armarAvisosInicio(base)).toEqual([])
  })

  it('ordena por importancia: plata y acceso primero', () => {
    const avisos = armarAvisosInicio({
      ...base,
      perfil: { profe_id: null, vencimiento: '2026-11-20' },
      plan: { tipo: 'gracia', dias: 2 },
      avanceNuevo: true,
      tocaMedidas: true,
    })
    expect(avisos.map((aviso) => aviso.id)).toEqual([
      'plan-gracia',
      'evaluacion',
      'sin-profe',
      'medidas',
    ])
    expect(avisos[0].tono).toBe('urgente')
    expect(avisos[0].texto).toContain('Tenés 2 días')
  })

  it('con el plan vencido y bloqueado no avisa vencimientos (lo dice la tarjeta grande)', () => {
    const avisos = armarAvisosInicio({
      ...base,
      plan: { tipo: 'gracia', dias: 0 },
      planBloqueado: true,
    })
    expect(avisos).toEqual([])
  })

  it('la ✕ los oculta 12 horas y después vuelven', () => {
    const avisos = armarAvisosInicio({ ...base, avanceNuevo: true, tocaMedidas: true })
    const ahora = Date.UTC(2026, 10, 24, 12)
    const silencio = { hasta: ahora + HORAS_SILENCIO * 3600 * 1000, ids: ['evaluacion', 'medidas'] }
    expect(avisosVisibles(avisos, silencio, ahora + 3600 * 1000)).toEqual([])
    expect(avisosVisibles(avisos, silencio, ahora + 13 * 3600 * 1000)).toHaveLength(2)
  })

  it('si aparece un aviso nuevo mientras están ocultos, ese sí se muestra', () => {
    const ahora = Date.UTC(2026, 10, 24, 12)
    const silencio = { hasta: ahora + HORAS_SILENCIO * 3600 * 1000, ids: ['medidas'] }
    const avisos = armarAvisosInicio({ ...base, avanceNuevo: true, tocaMedidas: true })
    expect(avisosVisibles(avisos, silencio, ahora).map((aviso) => aviso.id)).toEqual(['evaluacion'])
  })
})

// Período de las gráficas de Progreso (utils/progreso.js).
describe('período de las gráficas', () => {
  const filas = ['2026-08-03', '2026-09-28', '2026-10-26', '2026-11-02', '2026-11-23'].map(
    (semana) => ({ semana, valor: 1 }),
  )

  it('4 semanas, 3 meses o todo', () => {
    const hoy = '2026-11-24'
    expect(filtrarPorPeriodo(filas, '4-semanas', hoy).map((f) => f.semana)).toEqual([
      '2026-11-02',
      '2026-11-23',
    ])
    expect(filtrarPorPeriodo(filas, '3-meses', hoy)).toHaveLength(4)
    expect(filtrarPorPeriodo(filas, 'todo', hoy)).toHaveLength(5)
  })
})
