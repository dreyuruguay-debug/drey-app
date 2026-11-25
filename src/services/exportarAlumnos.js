import { clientesDelEspacio } from './espacio.js'
import { cargarActividadClientes } from './actividad.js'
import { obtenerPlan } from '../data/planes.js'
import { estadoDelPlan } from '../data/vencimiento.js'
import { descargarBlob } from '../utils/descargas.js'
import { obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'

// "Bajar alumnos en Excel" (tablero del dueño del gimnasio): una planilla
// con los alumnos activos del espacio elegido: nombre, celular, profe,
// plan, vencimiento, estado de la cuota y último entrenamiento. La
// librería de Excel se baja recién al tocar el botón.
//   nombreDelProfe(id): cómo se llama cada profe (los del tablero).
//   nombreArchivo: por ejemplo "Alumnos FitCenter".
const COLUMNAS = [
  { header: 'Nombre', key: 'nombre', width: 18 },
  { header: 'Apellido', key: 'apellido', width: 18 },
  { header: 'Celular', key: 'celular', width: 16 },
  { header: 'Profe', key: 'profe', width: 20 },
  { header: 'Plan', key: 'plan', width: 22 },
  { header: 'Vence', key: 'vence', width: 12 },
  { header: 'Cuota', key: 'cuota', width: 14 },
  { header: 'Último entrenamiento', key: 'ultimo', width: 20 },
]

const TEXTO_CUOTA = {
  'al-dia': 'Al día',
  'por-vencer': 'Por vencer',
  gracia: 'Vencida (gracia)',
  vencido: 'Vencida',
}

export async function bajarAlumnosEnExcel({ nombreDelProfe, nombreArchivo }) {
  const [{ data: alumnos, error }, actividad, modulo] = await Promise.all([
    clientesDelEspacio('*').eq('estado', 'activo').order('nombre'),
    cargarActividadClientes(),
    import('exceljs'),
  ])
  if (error) throw error
  const ExcelJS = modulo.default || modulo
  const hoy = obtenerFechaHoyISO()

  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('Alumnos')
  hoja.columns = COLUMNAS
  for (const alumno of alumnos || []) {
    const ultima = actividad.get(alumno.id)?.ultima
    hoja.addRow({
      nombre: alumno.nombre || '',
      apellido: alumno.apellido || '',
      celular: alumno.celular || '',
      profe: nombreDelProfe(alumno.profe_id),
      plan: obtenerPlan(alumno.plan)?.nombre || alumno.plan || '',
      vence: alumno.vencimiento ? textoFechaCorta(alumno.vencimiento) : '',
      cuota: TEXTO_CUOTA[estadoDelPlan(alumno, hoy).tipo] || '',
      ultimo: ultima ? textoFechaCorta(ultima) : 'Todavía no entrenó',
    })
  }
  hoja.getRow(1).font = { bold: true }
  hoja.views = [{ state: 'frozen', ySplit: 1 }]

  const datos = await libro.xlsx.writeBuffer()
  const blob = new Blob([datos], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  descargarBlob(blob, `${nombreArchivo} (${hoy}).xlsx`)
  return (alumnos || []).length
}
