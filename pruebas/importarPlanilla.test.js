// Prueba de ida y vuelta de la planilla de Excel: se arma una planilla
// desde rutinas de ejemplo (como "Descargar planilla"), se abre como lo
// haría la app al subirla y se revisa lo que entiende (analizarPlanilla).
// También se prueban planillas con errores típicos de un profe.
import { describe, expect, it } from 'vitest'
import { programaDesdeRutinas } from '../src/utils/programa.js'
import { contenidoDePlanilla } from '../src/utils/exportarPlanilla.js'
import { crearArchivoDePlanilla, leerArchivoDePlanilla } from '../src/services/planillaExcel.js'
import { analizarPlanilla, metodoDesdeTexto } from '../src/utils/importarPlanilla.js'

const BIBLIOTECA = [
  { id: 'e-sentadilla', nombre: 'Sentadilla', categoria: 'Piernas' },
  { id: 'e-banca', nombre: 'Press banca', categoria: 'Pecho' },
  { id: 'e-remo', nombre: 'Remo con barra', categoria: 'Espalda' },
  { id: 'e-plancha', nombre: 'Plancha', categoria: 'Abdomen' },
  { id: 'e-curl', nombre: 'Curl de bíceps', categoria: 'Brazos' },
  { id: 'e-vieja', nombre: 'Prensa vieja', categoria: 'Piernas', archivado: true },
]

const CLIENTE = { id: 'cliente-1', nombre: 'Lucía Pereira' }

function fila(id, orden, ejercicio, datos = {}) {
  return {
    id,
    ejercicio_id: ejercicio,
    orden,
    series: 4,
    reps_objetivo: '8-10',
    kg_objetivo: 40,
    rpe: null,
    descansos: null,
    descanso_min: 90,
    descanso_max: 90,
    calentamiento: null,
    metodo: 'normal',
    grupo: null,
    config: {},
    ...datos,
  }
}

const RUTINAS = [
  {
    rutina: {
      id: 'rutina-1',
      nombre: 'Día 1 · Piernas',
      grupos_musculares: ['piernas'],
      descripcion: 'Foco en técnica',
      pausa_min: 60,
      pausa_max: 90,
      ciclo_semanas: 3,
      calentamiento: [{ nombre: 'Bici', segundos: 300 }],
      vuelta_calma: [{ nombre: 'Estirar', segundos: 120 }],
    },
    ejercicios: [
      fila('f1', 1, 'e-sentadilla', { kg_objetivo: 60, descanso_min: 120, descanso_max: 150 }),
      fila('f2', 2, 'e-plancha', { reps_objetivo: '30 seg', kg_objetivo: null }),
    ],
  },
  {
    rutina: { id: 'rutina-2', nombre: 'Día 2 · Torso', grupos_musculares: ['pecho', 'espalda'] },
    ejercicios: [
      fila('f3', 1, 'e-banca', { metodo: 'biserie', grupo: 'A' }),
      fila('f4', 2, 'e-remo', { metodo: 'biserie', grupo: 'A' }),
      fila('f5', 3, 'e-curl', { series: 3, reps_objetivo: '12' }),
    ],
  },
]

async function libroDesdeRutinas(rutinas = RUTINAS) {
  const programa = programaDesdeRutinas({ cliente: CLIENTE, rutinas, semanas: 3 })
  const contenido = contenidoDePlanilla(programa, BIBLIOTECA, {
    fecha: new Date('2026-11-24T12:00:00'),
  })
  const bytes = await crearArchivoDePlanilla(contenido)
  return leerArchivoDePlanilla(bytes)
}

function contexto(extra = {}) {
  return { biblioteca: BIBLIOTECA, cliente: CLIENTE, actuales: RUTINAS, resoluciones: {}, ...extra }
}

// Cambia el valor de una celda de una hoja (por el título de su columna).
function cambiarCelda(libro, nombreHoja, numeroFila, tituloColumna, valor) {
  const hoja = libro.hojas.find((h) => h.nombre === nombreHoja)
  const encabezado = hoja.filas.find((f) => f.celdas.includes(tituloColumna))
  const columna = encabezado.celdas.indexOf(tituloColumna)
  const objetivo = hoja.filas.find((f) => f.numero === numeroFila)
  objetivo.celdas[columna] = valor
}

function primeraFilaDeDatos(libro, nombreHoja) {
  const hoja = libro.hojas.find((h) => h.nombre === nombreHoja)
  const encabezado = hoja.filas.find((f) => f.celdas.includes('Ejercicio'))
  return hoja.filas.find((f) => f.numero > encabezado.numero && f.celdas.some(Boolean)).numero
}

describe('planilla de Excel: ida y vuelta', () => {
  it('lee sin errores la planilla que arma la app', async () => {
    const libro = await libroDesdeRutinas()
    const resultado = analizarPlanilla(libro, contexto())
    expect(resultado.errores).toEqual([])
    expect(resultado.programa.dias).toHaveLength(2)
    expect(resultado.programa.semanas).toBe(3)
    expect(resultado.archivo.clienteId).toBe(CLIENTE.id)
    expect(resultado).toMatchSnapshot()
  })

  it('avisa con hoja y celda cuando unas repeticiones no se entienden', async () => {
    const libro = await libroDesdeRutinas()
    const numero = primeraFilaDeDatos(libro, 'Ejercicios')
    cambiarCelda(libro, 'Ejercicios', numero, 'Repeticiones', 'muchas')
    const resultado = analizarPlanilla(libro, contexto())
    expect(resultado.errores.length).toBeGreaterThan(0)
    expect(resultado.errores[0].hoja).toBe('Ejercicios')
    expect(resultado.errores).toMatchSnapshot()
  })

  it('pide resolver un ejercicio que no está en la biblioteca', async () => {
    const libro = await libroDesdeRutinas()
    const numero = primeraFilaDeDatos(libro, 'Ejercicios')
    cambiarCelda(libro, 'Ejercicios', numero, 'Ejercicio', 'Sentadilla búlgara')
    cambiarCelda(libro, 'Ejercicios', numero, 'ID ejercicio', null)
    const resultado = analizarPlanilla(libro, contexto())
    expect(resultado.desconocidos).toHaveLength(1)
    expect(resultado.desconocidos[0].nombre).toBe('Sentadilla búlgara')
    // Entre las opciones sugeridas está la sentadilla común.
    expect(JSON.stringify(resultado.desconocidos[0].opciones)).toContain('Sentadilla')
    expect(resultado.desconocidos).toMatchSnapshot()
  })

  it('una planilla de otro alumno crea rutinas nuevas y lo avisa', async () => {
    const libro = await libroDesdeRutinas()
    const resultado = analizarPlanilla(
      libro,
      contexto({ cliente: { id: 'otro', nombre: 'Martín' }, actuales: [] }),
    )
    expect(resultado.archivo.esDeOtroCliente).toBe(true)
    expect(resultado.advertencias.map((a) => a.texto).join(' ')).toContain('Martín')
  })

  it('rechaza un archivo que no es la planilla de DREY', () => {
    const resultado = analizarPlanilla({ hojas: [{ nombre: 'Hoja1', filas: [] }] }, contexto())
    expect(resultado.programa).toBeNull()
    expect(resultado.errores[0].texto).toContain('no es la planilla de DREY')
  })
})

describe('planilla de Excel: ayudas', () => {
  it('reconoce los métodos escritos de distintas formas', () => {
    expect(metodoDesdeTexto('Superserie')).toBe(metodoDesdeTexto('super serie'))
    expect(metodoDesdeTexto('')).toMatchSnapshot()
  })
})
