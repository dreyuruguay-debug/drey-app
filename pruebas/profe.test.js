// Pruebas de lo nuevo del profe: el buscador del panel y "La semana de
// todos" (qué hizo cada alumno).
import { describe, expect, it } from 'vitest'
import {
  contarPorFiltro,
  filtrarClientes,
  ordenarClientes,
  situacionDelCliente,
} from '../src/utils/clientes.js'
import { resumenDrey } from '../src/utils/resumenDrey.js'
import { moverBloqueA } from '../src/utils/bloques.js'
import { filtrarHistorial } from '../src/utils/historial.js'
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

describe('la semana de todos con el historial del calendario', () => {
  const clientes = [{ id: 'a1', nombre: 'Lucía' }]
  const rutinas = { r1: 'Piernas', r2: 'Torso' }
  // Hasta el 22/11 le tocaba lunes; desde el 23/11, martes (y el lunes nada).
  const historial = [
    { cliente_id: 'a1', dia: 'Lunes', rutina_id: 'r1', desde: '2026-11-09' },
    { cliente_id: 'a1', dia: 'Lunes', rutina_id: null, desde: '2026-11-23' },
    { cliente_id: 'a1', dia: 'Martes', rutina_id: 'r2', desde: '2026-11-23' },
  ]
  const armar = (lunes) =>
    armarSemana({
      clientes,
      calendario: { a1: { Martes: 'r2' } },
      historial,
      rutinas,
      sesiones: [{ cliente_id: 'a1', fecha: '2026-11-04', rutina_id: 'r1' }],
      lunes,
      hoy: '2026-11-25',
    })

  it('las semanas pasadas usan el calendario que valía entonces', () => {
    const [fila] = armar('2026-11-16').filas
    expect(fila.celdas[0]).toMatchObject({ estado: 'falto', texto: 'Piernas' }) // lunes 16
    expect(fila.celdas[1].estado).toBe('descanso') // el martes todavía no tocaba
    expect([fila.hechos, fila.previstos]).toEqual([0, 1])
  })

  it('esta semana usa el calendario nuevo', () => {
    const [fila] = armar('2026-11-23').filas
    expect(fila.celdas[0].estado).toBe('descanso')
    expect(fila.celdas[1]).toMatchObject({ estado: 'falto', texto: 'Torso' })
  })

  it('antes del historial no marca faltas, solo lo que entrenó', () => {
    const semana = armar('2026-11-02')
    const [fila] = semana.filas
    expect(fila.celdas[0].estado).toBe('sin-dato')
    expect(fila.celdas[2]).toMatchObject({ estado: 'hecho', texto: 'Piernas' }) // miércoles 4
    expect(semana.sinDatos).toBe(true)
    expect(semana.totales.faltas).toBe(0)
    expect(fila.previstos).toBe(0)
  })
})

// Lista de alumnos del panel (utils/clientes.js): situación, filtros y orden.
describe('lista de alumnos', () => {
  const HOY = '2026-11-24'
  const alumnos = [
    {
      id: 'a',
      nombre: 'Ana',
      apellido: 'Paz',
      diasSinEntrenar: 0,
      estado: 'activo',
      vencimiento: '2026-12-20',
      profe_id: 'p1',
    },
    {
      id: 'b',
      nombre: 'Bruno',
      apellido: 'Sosa',
      diasSinEntrenar: 9,
      estado: 'activo',
      vencimiento: '2026-12-10',
      profe_id: null,
    },
    {
      id: 'c',
      nombre: 'Carla',
      apellido: 'Ríos',
      diasSinEntrenar: 2,
      estado: 'activo',
      vencimiento: '2026-11-20',
      profe_id: 'p1',
    },
  ]

  it('marca en rojo la cuota vencida (solo para quien cobra) y en naranja al que no entrena', () => {
    expect(situacionDelCliente(alumnos[2], HOY, { veCuota: true }).tono).toBe('alerta')
    expect(situacionDelCliente(alumnos[2], HOY, { veCuota: false }).tono).toBe('ok')
    expect(situacionDelCliente(alumnos[1], HOY).tono).toBe('atencion')
    expect(situacionDelCliente(alumnos[0], HOY).entreno).toBe('Hoy')
  })

  it('filtra por chip, búsqueda y profe', () => {
    expect(filtrarClientes(alumnos, { filtro: 'no-entrenan', hoy: HOY }).map((a) => a.id)).toEqual([
      'b',
    ])
    expect(filtrarClientes(alumnos, { filtro: 'vencidos', hoy: HOY }).map((a) => a.id)).toEqual([
      'c',
    ])
    expect(filtrarClientes(alumnos, { texto: 'car', hoy: HOY }).map((a) => a.id)).toEqual(['c'])
    expect(filtrarClientes(alumnos, { profe: 'sin', hoy: HOY }).map((a) => a.id)).toEqual(['b'])
    expect(contarPorFiltro(alumnos, HOY)).toMatchObject({ '': 3, 'no-entrenan': 1, vencidos: 1 })
  })

  it('ordena por último entreno y deja al final a los que no tienen el dato', () => {
    const conVacio = [...alumnos, { id: 'd', nombre: 'Dani', apellido: '', diasSinEntrenar: null }]
    const orden = ordenarClientes(conVacio, { campo: 'entreno', ascendente: false })
    expect(orden.map((a) => a.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(ordenarClientes(alumnos, { campo: 'nombre' }).map((a) => a.id)).toEqual(['a', 'b', 'c'])
  })
})

// Inicio del Admin (utils/resumenDrey.js).
describe('números de DREY', () => {
  it('cuenta los que pagan, las pruebas por terminar y los ingresos del mes', () => {
    const HOY = '2026-11-24'
    const espacios = [
      { id: '1', estadoReal: 'activo', vencimiento: '2026-12-20', cuposTotal: 25, cuposUsados: 10 },
      { id: '2', estadoReal: 'prueba', pruebaHasta: '2026-11-27', cuposUsados: 2 },
      { id: '3', estadoReal: 'prueba', pruebaHasta: '2026-12-08', cuposUsados: 1 },
      { id: '4', estadoReal: 'prueba_terminada' },
      { id: '5', estadoReal: 'sin_costo', sinCosto: true },
    ]
    const pagos = [
      { monto: 1000, creado_en: '2026-11-05T15:00:00Z' },
      { monto: 500, creado_en: '2026-10-05T15:00:00Z' },
    ]
    const r = resumenDrey(espacios, pagos, HOY)
    expect(r).toMatchObject({
      pagan: 1,
      enPrueba: 2,
      pruebasPorTerminar: 1,
      terminaronPrueba: 1,
      sinCosto: 1,
      cuposVendidos: 25,
      cuposOcupados: 13,
      ingresosMes: 1000,
      ingresosMesPasado: 500,
    })
  })
})

// Arrastrar bloques en el editor de rutinas (utils/bloques.js).
describe('arrastrar bloques', () => {
  const items = [
    { id: 1, nombre: 'Sentadilla' },
    { id: 2, nombre: 'Press', grupo: 'g1' },
    { id: 3, nombre: 'Remo', grupo: 'g1' },
    { id: 4, nombre: 'Plancha' },
  ]

  it('lleva un bloque entero (con su superserie) a otro lugar y renumera', () => {
    const resultado = moverBloqueA(items, 1, 0)
    expect(resultado.map((fila) => fila.id)).toEqual([2, 3, 1, 4])
    expect(resultado.map((fila) => fila.orden)).toEqual([0, 1, 2, 3])
    expect(moverBloqueA(items, 0, 2).map((fila) => fila.id)).toEqual([2, 3, 4, 1])
  })

  it('soltarlo en el mismo lugar no cambia nada', () => {
    expect(moverBloqueA(items, 1, 1)).toBe(items)
  })
})

// Historial de cambios del Admin (utils/historial.js).
describe('filtros del historial', () => {
  const filas = [
    {
      id: 1,
      creado_en: '2026-11-24T15:00:00-03:00',
      tipo: 'plan',
      detalle: 'Cambió el precio del Plan seguimiento',
    },
    {
      id: 2,
      creado_en: '2026-11-20T10:00:00-03:00',
      tipo: 'cliente',
      detalle: 'Pasó a Martín Suárez con Sofía',
    },
    {
      id: 3,
      creado_en: '2026-10-01T10:00:00-03:00',
      tipo: 'drey',
      detalle: 'Pago DREY de FitCenter',
    },
  ]
  const hoy = '2026-11-24'

  it('filtra por período, tipo y texto (sin importar tildes)', () => {
    expect(filtrarHistorial(filas, { periodo: 'hoy', hoy }).map((f) => f.id)).toEqual([1])
    expect(filtrarHistorial(filas, { periodo: '7', hoy }).map((f) => f.id)).toEqual([1, 2])
    expect(filtrarHistorial(filas, { tipo: 'drey', hoy }).map((f) => f.id)).toEqual([3])
    expect(filtrarHistorial(filas, { texto: 'sofia', hoy }).map((f) => f.id)).toEqual([2])
    expect(filtrarHistorial(filas, { hoy })).toHaveLength(3)
  })
})
