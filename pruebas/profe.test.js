// Pruebas de lo nuevo del profe: el buscador del panel y "La semana de
// todos" (qué hizo cada alumno).
import { describe, expect, it } from 'vitest'
import { buscarEnTodo, PANTALLAS_DEL_PANEL } from '../src/utils/buscador.js'
import { armarSemana } from '../src/utils/semanaDeTodos.js'

const INDICE = {
  alumnos: [
    { id: 'a1', nombre: 'Lucía', apellido: 'Pereira', estado: 'activo' },
    { id: 'a2', nombre: 'Martín', apellido: 'Suárez', estado: 'pendiente' },
  ],
  rutinas: [{ id: 'r1', nombre: 'Día 1 · Piernas', cliente: 'Lucía Pereira' }],
  plantillas: [{ id: 'p1', nombre: 'Piernas principiante' }],
  ejercicios: [
    { id: 'e1', nombre: 'Sentadilla' },
    { id: 'e2', nombre: 'Prensa de piernas' },
  ],
  pantallas: PANTALLAS_DEL_PANEL,
}

describe('buscador del panel', () => {
  it('encuentra sin importar tildes ni mayúsculas', () => {
    const grupos = buscarEnTodo(INDICE, 'lucia')
    expect(grupos[0].clave).toBe('alumnos')
    expect(grupos[0].resultados[0].to).toBe('/profe/clientes/a1')
    // La rutina de Lucía también aparece (busca en el nombre del alumno).
    expect(grupos.find((g) => g.clave === 'rutinas').resultados[0].to).toBe('/profe/rutinas/r1')
  })

  it('busca en todos los grupos a la vez', () => {
    const claves = buscarEnTodo(INDICE, 'piernas').map((grupo) => grupo.clave)
    expect(claves).toEqual(['rutinas', 'plantillas', 'ejercicios'])
  })

  it('todas las palabras tienen que aparecer', () => {
    expect(buscarEnTodo(INDICE, 'martin suarez')[0].resultados).toHaveLength(1)
    expect(buscarEnTodo(INDICE, 'martin pereira')).toEqual([])
  })

  it('salta a pantallas del panel', () => {
    const grupos = buscarEnTodo(INDICE, 'cupones')
    expect(grupos[0].resultados[0].to).toBe('/profe/codigos')
    expect(buscarEnTodo(INDICE, '   ')).toEqual([])
  })
})

describe('la semana de todos', () => {
  const clientes = [
    { id: 'a1', nombre: 'Lucía' },
    { id: 'a2', nombre: 'Martín' },
  ]
  const calendario = { a1: { Lunes: 'r1', Miércoles: 'r2', Viernes: 'r1' }, a2: { Martes: 'r3' } }
  const rutinas = { r1: 'Piernas', r2: 'Torso', r3: 'Full body' }
  // Miércoles 25/11: el lunes 23 Lucía entrenó; Martín faltó el martes.
  const semana = armarSemana({
    clientes,
    calendario,
    rutinas,
    sesiones: [{ cliente_id: 'a1', fecha: '2026-11-23', rutina_id: 'r1' }],
    lunes: '2026-11-23',
    hoy: '2026-11-25',
  })

  it('marca lo hecho, lo que faltó y lo que le toca', () => {
    const [lucia, martin] = semana.filas
    expect(lucia.celdas[0]).toMatchObject({ estado: 'hecho', texto: 'Piernas' })
    expect(lucia.celdas[2]).toMatchObject({ estado: 'toca', texto: 'Torso' }) // hoy
    expect(lucia.celdas[1].estado).toBe('descanso')
    expect(martin.celdas[1]).toMatchObject({ estado: 'falto', texto: 'Full body' })
    expect([lucia.hechos, lucia.previstos]).toEqual([1, 3])
  })

  it('suma los totales de todos', () => {
    expect(semana.totales).toEqual({ hechos: 1, previstos: 4, faltas: 1, sinEntrenar: 1 })
  })
})
