import { diasEntre, textoFechaCorta } from './dias.js'

// Medidas del cliente (tabla "mediciones", supabase/sql/016). Nada de
// este archivo lee ni guarda en la base: recibe datos y devuelve
// resultados.

export const CAMPOS_MEDIDA = [
  { clave: 'peso', etiqueta: 'Peso', unidad: 'kg', paso: '0.1' },
  { clave: 'cintura', etiqueta: 'Cintura', unidad: 'cm', paso: '0.5' },
  { clave: 'cadera', etiqueta: 'Cadera', unidad: 'cm', paso: '0.5' },
  { clave: 'pecho', etiqueta: 'Pecho', unidad: 'cm', paso: '0.5' },
  { clave: 'brazo', etiqueta: 'Brazo', unidad: 'cm', paso: '0.5' },
  { clave: 'muslo', etiqueta: 'Muslo', unidad: 'cm', paso: '0.5' },
  { clave: 'grasa', etiqueta: '% de grasa', unidad: '%', paso: '0.1' },
]

// VALORACIÓN ANTROPOMÉTRICA (la que hace la nutricionista; SQL 038). Se
// carga en la misma medición, a mano o desde Excel:
//   · Composición: % de masa muscular y grasa visceral (el peso y el %
//     de grasa ya están en CAMPOS_MEDIDA).
//   · Pliegues, en milímetros. La SUMA no se guarda: se calcula
//     (sumaDePliegues) y va en cada medición como "suma_pliegues"
//     (conSumaDePliegues), así se muestra y se grafica como un campo más.
export const CAMPOS_COMPOSICION = [
  { clave: 'masa_muscular', etiqueta: '% de masa muscular', corta: '% m. musc', unidad: '%', paso: '0.1' },
  { clave: 'grasa_visceral', etiqueta: 'Grasa visceral', corta: 'Grasa visc', unidad: '', paso: '0.5' },
]

export const PLIEGUES = [
  { clave: 'pl_triceps', etiqueta: 'Tríceps', unidad: 'mm', paso: '0.5' },
  { clave: 'pl_espalda', etiqueta: 'Espalda', unidad: 'mm', paso: '0.5' },
  { clave: 'pl_oblicuo', etiqueta: 'Oblicuo', unidad: 'mm', paso: '0.5' },
  { clave: 'pl_abdomen', etiqueta: 'Abdomen', unidad: 'mm', paso: '0.5' },
  { clave: 'pl_muslo', etiqueta: 'Muslo', unidad: 'mm', paso: '0.5' },
  { clave: 'pl_pantorrilla', etiqueta: 'Pantorrilla', unidad: 'mm', paso: '0.5' },
]

export const CLAVE_SUMA_PLIEGUES = 'suma_pliegues'
const CAMPO_SUMA_PLIEGUES = {
  clave: CLAVE_SUMA_PLIEGUES,
  etiqueta: 'Suma de pliegues',
  unidad: 'mm',
}

// Todo lo que se puede mostrar en el resumen y graficar: las medidas de
// siempre, la composición y la suma de pliegues.
export const CAMPOS_PARA_GRAFICAR = [...CAMPOS_MEDIDA, ...CAMPOS_COMPOSICION, CAMPO_SUMA_PLIEGUES]

// Lo que se escribe en una medición además de las medidas de siempre.
export const CAMPOS_ANTROPOMETRIA = [...CAMPOS_COMPOSICION, ...PLIEGUES]

function tieneValor(valor) {
  return valor !== null && valor !== undefined && valor !== ''
}

// Suma de los pliegues cargados (mm), o null si no cargó ninguno.
export function sumaDePliegues(medicion) {
  const cargados = PLIEGUES.filter((pliegue) => tieneValor(medicion?.[pliegue.clave]))
  if (!cargados.length) return null
  const suma = cargados.reduce((total, pliegue) => total + Number(medicion[pliegue.clave]), 0)
  return Math.round(suma * 10) / 10
}

// Las mediciones con su "suma_pliegues" calculada (no se guarda).
export function conSumaDePliegues(mediciones) {
  return (mediciones || []).map((medicion) => ({
    ...medicion,
    [CLAVE_SUMA_PLIEGUES]: sumaDePliegues(medicion),
  }))
}

// true si esa medición tiene algo de la valoración antropométrica.
export function tieneAntropometria(medicion) {
  return CAMPOS_ANTROPOMETRIA.some((campo) => tieneValor(medicion?.[campo.clave]))
}

// Las dos tablas de la valoración, como las arma la nutricionista:
//   composicion: una fila por fecha → [{ id, fecha, peso, grasa,
//     masa_muscular, grasa_visceral }]
//   pliegues: una columna por fecha → { fechas: [{ id, fecha }],
//     filas: [{ clave, etiqueta, valores: [n | null] }], sumas: [n | null] }
// Entran las mediciones con algún dato antropométrico (y su peso). null
// si no hay ninguna.
export function tablasAntropometricas(mediciones) {
  const conDatos = ordenarPorFecha(mediciones || []).filter(tieneAntropometria)
  if (!conDatos.length) return null
  const numero = (valor) => (tieneValor(valor) ? Number(valor) : null)
  const conPliegues = conDatos.filter((medicion) => sumaDePliegues(medicion) !== null)
  return {
    composicion: conDatos.map((medicion) => ({
      id: medicion.id,
      fecha: medicion.fecha,
      peso: numero(medicion.peso),
      grasa: numero(medicion.grasa),
      masa_muscular: numero(medicion.masa_muscular),
      grasa_visceral: numero(medicion.grasa_visceral),
    })),
    pliegues: conPliegues.length
      ? {
          fechas: conPliegues.map((medicion) => ({ id: medicion.id, fecha: medicion.fecha })),
          filas: PLIEGUES.map((pliegue) => ({
            clave: pliegue.clave,
            etiqueta: pliegue.etiqueta,
            valores: conPliegues.map((medicion) => numero(medicion[pliegue.clave])),
          })),
          sumas: conPliegues.map(sumaDePliegues),
        }
      : null,
  }
}

export const VISTAS_FOTO = [
  { clave: 'frente', etiqueta: 'Frente' },
  { clave: 'perfil', etiqueta: 'Perfil' },
  { clave: 'espalda', etiqueta: 'Espalda' },
]

// Fotos de una medición (columna "fotos", jsonb). Una principal por
// vista (frente, perfil, espalda: las que se comparan "antes y ahora") y,
// desde el 01/10/2026, "otras": la lista de las que se suman sin
// reemplazar ninguna (una segunda de la misma vista, una distinta o las
// que se agregan después), cada una con su vista:
//   { frente: 'cliente/1-frente.jpg',
//     otras: [{ ruta: 'cliente/2-frente.jpg', vista: 'frente' },
//             { ruta: 'cliente/3-otras.jpg', vista: 'otras' }] }
// Las mediciones de antes (sin "otras") se leen igual.
export const CLAVE_OTRAS_FOTOS = 'otras'

const ETIQUETA_OTRA = 'Otra'

function etiquetaDeVista(vista) {
  return VISTAS_FOTO.find((opcion) => opcion.clave === vista)?.etiqueta || ETIQUETA_OTRA
}

function listaDeOtras(fotos) {
  const otras = fotos?.[CLAVE_OTRAS_FOTOS]
  return Array.isArray(otras) ? otras : []
}

// Todas las fotos de una medición, en orden: [{ ruta, vista, etiqueta, principal }].
export function fotosDeMedicion(medicion) {
  const fotos = medicion?.fotos || {}
  const lista = VISTAS_FOTO.filter((opcion) => typeof fotos[opcion.clave] === 'string').map(
    (opcion) => ({
      ruta: fotos[opcion.clave],
      vista: opcion.clave,
      etiqueta: opcion.etiqueta,
      principal: true,
    }),
  )
  for (const item of listaDeOtras(fotos)) {
    const ruta = typeof item === 'string' ? item : item?.ruta
    if (!ruta) continue
    const vista = typeof item === 'string' ? CLAVE_OTRAS_FOTOS : item.vista || CLAVE_OTRAS_FOTOS
    lista.push({ ruta, vista, etiqueta: etiquetaDeVista(vista), principal: false })
  }
  return lista
}

export function rutasDeFotos(medicion) {
  return fotosDeMedicion(medicion).map((foto) => foto.ruta)
}

// Suma fotos nuevas a las que ya tiene una medición, sin reemplazar
// ninguna: si la vista está libre, pasa a ser la principal; si ya tiene
// foto (o es "otra"), va a la lista "otras" con su vista.
// nuevas: [{ vista, ruta }] (vista = 'frente' | 'perfil' | 'espalda' | 'otras').
export function sumarFotos(fotos = {}, nuevas = []) {
  const resultado = { ...fotos }
  const otras = [...listaDeOtras(fotos)]
  for (const { vista, ruta } of nuevas) {
    const esVista = VISTAS_FOTO.some((opcion) => opcion.clave === vista)
    if (esVista && !resultado[vista]) resultado[vista] = ruta
    else otras.push({ ruta, vista: esVista ? vista : CLAVE_OTRAS_FOTOS })
  }
  if (otras.length) resultado[CLAVE_OTRAS_FOTOS] = otras
  return resultado
}

// Saca una foto de la medición (las demás quedan igual). Si era la
// principal de una vista y hay otra de esa misma vista, esa pasa a ser
// la principal (así "antes y ahora" sigue teniendo foto).
export function quitarFoto(fotos = {}, ruta) {
  const resultado = {}
  for (const [clave, valor] of Object.entries(fotos)) {
    if (Array.isArray(valor)) {
      const quedan = valor.filter((item) => (typeof item === 'string' ? item : item?.ruta) !== ruta)
      if (quedan.length) resultado[clave] = quedan
    } else if (valor && valor !== ruta) {
      resultado[clave] = valor
    }
  }
  for (const { clave } of VISTAS_FOTO) {
    if (resultado[clave]) continue
    const otras = listaDeOtras(resultado)
    const reemplazo = otras.find((item) => typeof item === 'object' && item?.vista === clave)
    if (!reemplazo) continue
    resultado[clave] = reemplazo.ruta
    const quedan = otras.filter((item) => item !== reemplazo)
    if (quedan.length) resultado[CLAVE_OTRAS_FOTOS] = quedan
    else delete resultado[CLAVE_OTRAS_FOTOS]
  }
  return resultado
}

// Cada cuánto conviene volver a medirse.
export const DIAS_ENTRE_MEDICIONES = 28

export function ordenarPorFecha(mediciones) {
  return [...mediciones].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
}

// Puntos para la gráfica de un campo: [{ etiqueta: '24/9', valor }].
export function serieDe(mediciones, clave) {
  return ordenarPorFecha(mediciones)
    .filter((medicion) => medicion[clave] !== null && medicion[clave] !== undefined)
    .map((medicion) => ({
      etiqueta: textoFechaCorta(medicion.fecha),
      valor: Number(medicion[clave]),
    }))
}

// Primer y último valor de un campo y cuánto cambió.
export function cambioDe(mediciones, clave) {
  const serie = ordenarPorFecha(mediciones).filter(
    (medicion) => medicion[clave] !== null && medicion[clave] !== undefined,
  )
  if (!serie.length) return null
  const primera = Number(serie[0][clave])
  const ultima = Number(serie[serie.length - 1][clave])
  return {
    primera,
    ultima,
    cambio: Math.round((ultima - primera) * 10) / 10,
    cantidad: serie.length,
  }
}

// true si nunca se midió o pasaron DIAS_ENTRE_MEDICIONES desde la última.
export function tocaMedirse(ultimaFecha, hoyISO) {
  if (!ultimaFecha) return true
  return diasEntre(ultimaFecha, hoyISO) >= DIAS_ENTRE_MEDICIONES
}

// Índice de masa corporal (peso / altura²), con un decimal.
export function calcularIMC(peso, alturaCm) {
  const altura = Number(alturaCm) / 100
  if (!peso || !altura) return null
  return Math.round((Number(peso) / (altura * altura)) * 10) / 10
}

// La altura más reciente cargada (se mide en la evaluación inicial).
export function alturaConocida(mediciones) {
  return (
    ordenarPorFecha(mediciones)
      .reverse()
      .find((medicion) => medicion.altura)?.altura || null
  )
}
