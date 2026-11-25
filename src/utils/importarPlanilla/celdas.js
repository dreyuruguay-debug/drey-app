import { textoReps } from '../formatos.js'
import { normalizarTexto } from '../texto.js'

// Leer el valor de una celda: números, repeticiones, pesos, segundos, RPE y textos.
// Parte de la lectura de la planilla de Excel (ver utils/importarPlanilla.js).
export function vacio(valor) {
  return valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '')
}

export function textoDe(valor) {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  return String(valor).trim()
}

export function leerEntero(valor, minimo, maximo) {
  if (vacio(valor)) return { valor: null }
  const numero = typeof valor === 'number' ? valor : Number(String(valor).trim().replace(',', '.'))
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo)
    return { valor: null, error: true }
  return { valor: numero }
}

// Repeticiones: 10 · "10" · "8-12" · "8 a 12" · "8–12". Si Excel lo
// convirtió en fecha (8-10 → 8 de octubre), se recupera.
// En segundos (ejercicio por tiempo, como la plancha): "6 seg" · "6s" ·
// "6 segundos" · "6''" · "20-30 seg". Devuelve además porTiempo: true.
const SUFIJO_SEGUNDOS = String.raw`(?:s|seg|segs|segundo|segundos|sec|"|''|”|″)\.?`
const MAXIMO_SEGUNDOS_DE_SERIE = 600

function leerSegundosDeSerie(texto) {
  const rango = texto.match(
    new RegExp(String.raw`^(\d{1,3})\s*(?:-|–|—|a|/)\s*(\d{1,3})\s*${SUFIJO_SEGUNDOS}$`),
  )
  if (rango) {
    const desde = Number(rango[1])
    const hasta = Number(rango[2])
    if (desde >= 1 && hasta >= desde && hasta <= MAXIMO_SEGUNDOS_DE_SERIE) {
      return { valor: textoReps(desde, hasta), porTiempo: true }
    }
    return { valor: null, error: true }
  }
  const uno = texto.match(new RegExp(String.raw`^(\d{1,3})\s*${SUFIJO_SEGUNDOS}$`))
  if (!uno) return null
  const segundos = Number(uno[1])
  if (segundos >= 1 && segundos <= MAXIMO_SEGUNDOS_DE_SERIE) {
    return { valor: String(segundos), porTiempo: true }
  }
  return { valor: null, error: true }
}

export function leerReps(valor) {
  if (vacio(valor)) return { valor: null }
  if (valor instanceof Date) {
    const a = valor.getUTCDate()
    const b = valor.getUTCMonth() + 1
    const [desde, hasta] = a <= b ? [a, b] : [b, a]
    return {
      valor: textoReps(desde, hasta),
      aviso: `Excel había convertido las repeticiones en una fecha; se leyó ${desde}-${hasta}.`,
    }
  }
  const texto = String(valor).trim().toLowerCase()
  const enSegundos = leerSegundosDeSerie(texto)
  if (enSegundos) return enSegundos
  const rango = texto.match(
    /^(\d{1,3})\s*(?:-|–|—|a|\/)\s*(\d{1,3})(?:\s*(?:reps?|repeticiones))?$/,
  )
  if (rango) {
    const desde = Number(rango[1])
    const hasta = Number(rango[2])
    if (desde >= 1 && hasta >= desde && hasta <= 100) return { valor: textoReps(desde, hasta) }
    return { valor: null, error: true }
  }
  const uno = texto.match(/^(\d{1,3})(?:[.,]0+)?(?:\s*(?:reps?|repeticiones))?$/)
  if (uno && Number(uno[1]) >= 1 && Number(uno[1]) <= 100) return { valor: String(Number(uno[1])) }
  return { valor: null, error: true }
}

// Peso en kg. undefined = vacío (repite la semana anterior); null = sin
// peso ("-").
export function leerPeso(valor) {
  if (vacio(valor)) return { valor: undefined }
  if (typeof valor === 'number') {
    return valor >= 0 && valor <= 1000
      ? { valor: redondearPeso(valor) }
      : { valor: undefined, error: true }
  }
  if (valor instanceof Date) return { valor: undefined, error: true }
  const texto = String(valor).trim().toLowerCase()
  if (/^[-–—_]+$/.test(texto) || ['sin peso', 'no', 'x'].includes(texto)) return { valor: null }
  if (['pc', 'peso corporal', 'corporal', 'bw', 'propio peso'].includes(texto)) {
    return { valor: null, aviso: 'peso del cuerpo: se toma como "sin peso".' }
  }
  const numero = texto.match(/^(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilos?)?$/)
  if (numero) {
    const kg = Number(numero[1].replace(',', '.'))
    if (kg <= 1000) return { valor: redondearPeso(kg) }
  }
  return { valor: undefined, error: true }
}

function redondearPeso(valor) {
  return Math.round(valor * 100) / 100
}

// Segundos (descanso o pausa): 90 · "90 s" · "1:30" · "2 min" · "60-90".
// Devuelve { valor: { min, max } | null }.
const MAXIMO_SEGUNDOS = 900

export function leerSegundos(valor) {
  if (vacio(valor)) return { valor: null }
  if (valor instanceof Date) {
    // "1:30" que Excel tomó como hora (1 h 30 min): se lee 1 min 30 s.
    const segundos = valor.getUTCHours() * 60 + valor.getUTCMinutes()
    if (segundos > 0 && segundos <= MAXIMO_SEGUNDOS && !valor.getUTCSeconds()) {
      return {
        valor: { min: segundos, max: segundos },
        aviso: `Excel había convertido el tiempo en una hora; se leyó ${segundos} s.`,
      }
    }
    return { valor: null, error: 'el tiempo no es válido (escribilo en segundos, por ejemplo 90).' }
  }
  if (typeof valor === 'number') {
    const segundos = Math.round(valor)
    return segundos >= 0 && segundos <= MAXIMO_SEGUNDOS
      ? { valor: { min: segundos, max: segundos } }
      : {
          valor: null,
          error: `el tiempo tiene que ser en segundos, de 0 a ${MAXIMO_SEGUNDOS} (dice ${valor}).`,
        }
  }
  const partes = String(valor)
    .trim()
    .toLowerCase()
    .split(/\s*(?:-|–|—|\sa\s)\s*/)
  const numeros = partes.map(segundosDeTexto)
  if (numeros.length > 2 || numeros.some((numero) => numero === null)) {
    return {
      valor: null,
      error: `el tiempo no se entiende ("${valor}"): escribilo en segundos (90) o como rango (60-90).`,
    }
  }
  const [min, max = min] = numeros
  if (min > max || max > MAXIMO_SEGUNDOS) {
    return {
      valor: null,
      error: `el tiempo no es válido ("${valor}"): de 0 a ${MAXIMO_SEGUNDOS} segundos, el más chico primero.`,
    }
  }
  return { valor: { min, max } }
}

function segundosDeTexto(texto) {
  const reloj = texto.match(/^(\d{1,2}):([0-5]\d)$/)
  if (reloj) return Number(reloj[1]) * 60 + Number(reloj[2])
  const minutos = texto.match(/^(\d+(?:[.,]\d+)?)\s*(?:min|mins|minutos?|m|')$/)
  if (minutos) return Math.round(Number(minutos[1].replace(',', '.')) * 60)
  const segundos = texto.match(/^(\d+)\s*(?:s|seg|segs|segundos?|"|'')?$/)
  if (segundos) return Number(segundos[1])
  return null
}

// RPE: "8" · "7-8" · "RIR 2" (se pasa a RPE 8).
export function leerRpe(valor) {
  if (vacio(valor)) return { valor: null }
  if (valor instanceof Date)
    return { valor: null, error: 'el RPE no es válido (un número del 1 al 10).' }
  const texto = String(valor).trim()
  const rir = texto.match(/^rir\s*(\d+(?:[.,]5)?)(?:\s*[-–a]\s*(\d+(?:[.,]5)?))?$/i)
  if (rir) {
    const aRpe = (numero) => String(10 - Number(numero.replace(',', '.'))).replace('.', ',')
    const rpe = rir[2] ? `${aRpe(rir[2])}-${aRpe(rir[1])}` : aRpe(rir[1])
    return { valor: rpe, aviso: `"${texto}" se guardó como RPE ${rpe} (RPE = 10 − RIR).` }
  }
  const limpio = texto.replace(/^rpe\s*/i, '')
  const numeros = limpio.split(/\s*[-–]\s*/).map((parte) => Number(parte.replace(',', '.')))
  if (numeros.length <= 2 && numeros.every((numero) => numero >= 1 && numero <= 10)) {
    return { valor: limpio.replace(/\s*[-–]\s*/, '-') }
  }
  // En la app el RPE es un texto libre: se respeta lo que escribió el profe.
  if (texto.length <= MAXIMO_TEXTO_RPE) return { valor: texto }
  return {
    valor: null,
    error: `el RPE es muy largo ("${texto}"): un número del 1 al 10 (o un rango, como 7-8).`,
  }
}

const MAXIMO_TEXTO_RPE = 20

export function leerTexto(valor, maximo, nombre, recortar = false) {
  if (vacio(valor)) return { valor: null }
  if (valor instanceof Date)
    return {
      valor: null,
      error: `Excel convirtió ${nombre} en una fecha: escribilo de nuevo con la celda en formato Texto.`,
    }
  const texto = String(valor).trim()
  if (texto.length <= maximo) return { valor: texto }
  if (recortar) {
    return {
      valor: texto.slice(0, maximo),
      aviso: `${nombre} son muy largas: se guardan las primeras ${maximo} letras.`,
    }
  }
  return { valor: null, error: `${nombre} es muy largo (hasta ${maximo} letras).` }
}

// Texto sin tildes, mayúsculas ni signos ("Drop-set" → "dropset").
export function compacto(texto) {
  return normalizarTexto(texto).replace(/[^a-z0-9]/g, '')
}
