import { normalizarTexto } from './texto.js'

// El buscador del panel del profe (components/BuscadorGlobal.jsx): busca
// en alumnos, rutinas, plantillas, ejercicios y pantallas a la vez. Acá
// está solo la búsqueda (sin pantalla ni base), para poder probarla.

export const GRUPOS_BUSCADOR = [
  { clave: 'alumnos', titulo: 'Alumnos' },
  { clave: 'rutinas', titulo: 'Rutinas' },
  { clave: 'plantillas', titulo: 'Plantillas' },
  { clave: 'ejercicios', titulo: 'Ejercicios' },
  { clave: 'pantallas', titulo: 'Ir a…' },
]

const MAXIMO_POR_GRUPO = 5

// Pantallas del panel a las que se puede saltar escribiendo su nombre.
export const PANTALLAS_DEL_PANEL = [
  { texto: 'Inicio del panel', to: '/profe', otros: 'tareas para hacer hoy' },
  { texto: 'Clientes', to: '/profe/clientes', otros: 'alumnos lista' },
  {
    texto: 'La semana de todos',
    to: '/profe/calendario',
    otros: 'calendario semanal vista semana',
  },
  { texto: 'Biblioteca de ejercicios', to: '/profe/ejercicios', otros: 'ejercicios videos fotos' },
  { texto: 'Plantillas', to: '/profe/plantillas', otros: 'rutinas modelo' },
  { texto: 'Mensajes a los alumnos', to: '/profe/mensajes', otros: 'avisos novedades' },
  { texto: 'Cobros y pagos', to: '/profe/cuentas', otros: 'cuotas pagos planes' },
  { texto: 'Códigos de descuento', to: '/profe/codigos', otros: 'cupones' },
  { texto: 'Estadísticas', to: '/profe/estadisticas', otros: 'números' },
  { texto: 'Progresión', to: '/profe/progresion', otros: 'cargas' },
  { texto: 'Solicitudes de alumnos', to: '/profe/solicitudes', otros: 'pedidos' },
  { texto: 'Mi perfil', to: '/profe/mi-perfil', otros: 'foto especialidades' },
  { texto: 'Mis espacios', to: '/profe/espacios', otros: 'gimnasios' },
  {
    texto: 'Tablero del gimnasio',
    to: '/profe/tablero',
    otros: 'cupos dejaron de venir',
    soloDueno: true,
  },
  { texto: 'Equipo del gimnasio', to: '/profe/equipo', otros: 'profes', soloDueno: true },
  { texto: 'Suscripción DREY', to: '/profe/suscripcion', otros: 'plan pagar', soloDueno: true },
]

// indice: { alumnos: [{ id, nombre, apellido }], rutinas: [{ id, nombre,
// cliente }], plantillas: [{ id, nombre }], ejercicios: [{ id, nombre }],
// pantallas: [{ texto, to, otros }] }
// Devuelve [{ clave, titulo, resultados: [{ id, texto, detalle, to }] }]
// solo con los grupos que encontraron algo. Todas las palabras tienen que
// aparecer (sin importar tildes ni mayúsculas).
export function buscarEnTodo(indice, texto) {
  const palabras = normalizarTexto(texto || '')
    .split(/\s+/)
    .filter(Boolean)
  if (!palabras.length) return []
  const coincide = (...partes) => {
    const todo = normalizarTexto(partes.filter(Boolean).join(' '))
    return palabras.every((palabra) => todo.includes(palabra))
  }
  const armados = {
    alumnos: (indice.alumnos || [])
      .filter((alumno) => coincide(alumno.nombre, alumno.apellido))
      .map((alumno) => ({
        id: alumno.id,
        texto: [alumno.nombre, alumno.apellido].filter(Boolean).join(' '),
        detalle: alumno.estado === 'pendiente' ? 'Espera que lo habilites' : 'Ficha del alumno',
        to: `/profe/clientes/${alumno.id}`,
      })),
    rutinas: (indice.rutinas || [])
      .filter((rutina) => coincide(rutina.nombre, rutina.cliente))
      .map((rutina) => ({
        id: rutina.id,
        texto: rutina.nombre,
        detalle: rutina.cliente ? `De ${rutina.cliente}` : 'Rutina',
        to: `/profe/rutinas/${rutina.id}`,
      })),
    plantillas: (indice.plantillas || [])
      .filter((plantilla) => coincide(plantilla.nombre))
      .map((plantilla) => ({
        id: plantilla.id,
        texto: plantilla.nombre,
        detalle: 'Plantilla',
        to: `/profe/plantillas/${plantilla.id}`,
      })),
    ejercicios: (indice.ejercicios || [])
      .filter((ejercicio) => coincide(ejercicio.nombre))
      .map((ejercicio) => ({
        id: ejercicio.id,
        texto: ejercicio.nombre,
        detalle: 'En la biblioteca',
        to: `/profe/ejercicios?buscar=${encodeURIComponent(ejercicio.nombre)}`,
      })),
    pantallas: (indice.pantallas || [])
      .filter((pantalla) => coincide(pantalla.texto, pantalla.otros))
      .map((pantalla) => ({
        id: pantalla.to,
        texto: pantalla.texto,
        detalle: 'Pantalla',
        to: pantalla.to,
      })),
  }
  return GRUPOS_BUSCADOR.map((grupo) => ({
    ...grupo,
    resultados: ordenarPorParecido(armados[grupo.clave], palabras[0]).slice(0, MAXIMO_POR_GRUPO),
  })).filter((grupo) => grupo.resultados.length > 0)
}

// Primero los que empiezan con lo que se escribió.
function ordenarPorParecido(lista, primera) {
  return [...lista].sort((a, b) => {
    const empiezaA = normalizarTexto(a.texto).startsWith(primera) ? 0 : 1
    const empiezaB = normalizarTexto(b.texto).startsWith(primera) ? 0 : 1
    return empiezaA - empiezaB || a.texto.localeCompare(b.texto)
  })
}
