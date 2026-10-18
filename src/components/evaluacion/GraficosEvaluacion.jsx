import { formatearNumero } from '../../utils/progreso.js'

// Gráficas de la evaluación mensual, dibujadas a mano (SVG) como el
// resto de las gráficas de DREY. Los colores llegan por "colores"
// (components/evaluacion/colores.js) y van escritos en cada figura, así
// salen iguales en la app y en el PDF.

const FUENTE = "'Manrope', system-ui, sans-serif"

// Volumen (kg × reps) de cada semana del mes, con una línea punteada en
// el promedio semanal del mes anterior (si lo hay; la explica el texto de
// abajo de la gráfica) y los entrenamientos de cada semana debajo.
export function GraficoSemanas({ semanas, promedioAnterior, colores }) {
  const ANCHO = 320
  const ALTO = 180
  const M = { arriba: 22, derecha: 6, abajo: 40, izquierda: 6 }
  const anchoUtil = ANCHO - M.izquierda - M.derecha
  const altoUtil = ALTO - M.arriba - M.abajo
  const valores = semanas.map((semana) => semana.volumen)
  const tope = Math.max(...valores, promedioAnterior || 0, 1) * 1.12
  const columna = anchoUtil / semanas.length
  const anchoBarra = Math.min(46, columna * 0.56)
  const y = (valor) => M.arriba + altoUtil - (valor / tope) * altoUtil

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      className="evaluacion-svg"
      role="img"
      aria-label="Volumen por semana"
    >
      <line
        x1={M.izquierda}
        x2={ANCHO - M.derecha}
        y1={y(0)}
        y2={y(0)}
        style={{ stroke: colores.guia, strokeWidth: 1 }}
      />
      {semanas.map((semana, indice) => {
        const centro = M.izquierda + columna * (indice + 0.5)
        const alto = Math.max(0, y(0) - y(semana.volumen))
        return (
          <g key={indice}>
            <rect
              x={centro - anchoBarra / 2}
              y={y(semana.volumen)}
              width={anchoBarra}
              height={alto}
              rx="5"
              style={{ fill: semana.volumen > 0 ? colores.barra : colores.barraSuave }}
            />
            <text
              x={centro}
              y={y(semana.volumen) - 6}
              textAnchor="middle"
              style={{
                fill: colores.textoFuerte,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: FUENTE,
              }}
            >
              {semana.volumen > 0 ? formatearNumero(semana.volumen) : '—'}
            </text>
            <text
              x={centro}
              y={ALTO - 22}
              textAnchor="middle"
              style={{
                fill: colores.textoFuerte,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: FUENTE,
              }}
            >
              {`Semana ${indice + 1}`}
            </text>
            <text
              x={centro}
              y={ALTO - 9}
              textAnchor="middle"
              style={{ fill: colores.texto, fontSize: 10, fontFamily: FUENTE }}
            >
              {`${semana.entrenamientos} entreno${semana.entrenamientos === 1 ? '' : 's'}`}
            </text>
          </g>
        )
      })}
      {promedioAnterior > 0 && (
        <line
          x1={M.izquierda}
          x2={ANCHO - M.derecha}
          y1={y(promedioAnterior)}
          y2={y(promedioAnterior)}
          style={{ stroke: colores.referencia, strokeWidth: 1.5, strokeDasharray: '5 4' }}
        />
      )}
    </svg>
  )
}

// Cuánto mejoró (o bajó) cada ejercicio, en %: barras hacia la derecha
// (verde) o hacia la izquierda (rojo) desde el cero.
//   filas: [{ nombre, valor }]
export function GraficoMejoras({ filas, colores }) {
  const ANCHO = 320
  const ALTO_FILA = 24
  const NOMBRE = 112
  const VALOR = 48
  const alto = filas.length * ALTO_FILA + 8
  const maximo = Math.max(...filas.map((fila) => Math.abs(fila.valor)), 1)
  const hayNegativos = filas.some((fila) => fila.valor < 0)
  const inicioBarras = NOMBRE + 6
  const anchoBarras = ANCHO - inicioBarras - VALOR
  const cero = hayNegativos ? inicioBarras + anchoBarras * 0.3 : inicioBarras
  const escala = (hayNegativos ? anchoBarras * 0.7 : anchoBarras) / maximo
  const escalaNegativa = hayNegativos ? (anchoBarras * 0.3) / maximo : 0

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${alto}`}
      className="evaluacion-svg"
      role="img"
      aria-label="Mejora por ejercicio"
    >
      <line
        x1={cero}
        x2={cero}
        y1={2}
        y2={alto - 4}
        style={{ stroke: colores.guia, strokeWidth: 1 }}
      />
      {filas.map((fila, indice) => {
        const medio = 4 + indice * ALTO_FILA + ALTO_FILA / 2
        const largo = fila.valor >= 0 ? fila.valor * escala : -fila.valor * escalaNegativa
        const x = fila.valor >= 0 ? cero : cero - largo
        const color = fila.valor > 0 ? colores.sube : fila.valor < 0 ? colores.baja : colores.texto
        const xTexto = fila.valor >= 0 ? cero + largo + 4 : cero + 4
        return (
          <g key={indice}>
            <text
              x={NOMBRE}
              y={medio + 3.5}
              textAnchor="end"
              style={{ fill: colores.textoFuerte, fontSize: 11, fontFamily: FUENTE }}
            >
              {recortar(fila.nombre, 20)}
            </text>
            <rect
              x={x}
              y={medio - 6}
              width={Math.max(largo, 1.5)}
              height={12}
              rx="3"
              style={{ fill: color }}
            />
            <text
              x={xTexto}
              y={medio + 3.5}
              style={{ fill: color, fontSize: 11, fontWeight: 700, fontFamily: FUENTE }}
            >
              {`${fila.valor > 0 ? '+' : ''}${formatearNumero(fila.valor)}%`}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// Mini gráfica de línea: la carga de cada sesión del mes en un ejercicio.
export function MiniLinea({ valores, colores }) {
  const ANCHO = 120
  const ALTO = 36
  if (valores.length < 2) return null
  const minimo = Math.min(...valores)
  const maximo = Math.max(...valores)
  const rango = maximo - minimo || 1
  const x = (indice) => 4 + ((ANCHO - 8) / (valores.length - 1)) * indice
  const y = (valor) => ALTO - 5 - ((valor - minimo) / rango) * (ALTO - 10)
  const puntos = valores.map((valor, indice) => `${x(indice)},${y(valor)}`).join(' ')
  const ultimo = valores.length - 1
  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="evaluacion-mini" aria-hidden="true">
      <polyline
        points={puntos}
        style={{ fill: 'none', stroke: colores.linea, strokeWidth: 2, strokeLinejoin: 'round' }}
      />
      <circle
        cx={x(ultimo)}
        cy={y(valores[ultimo])}
        r="3"
        style={{ fill: colores.linea, stroke: colores.punto, strokeWidth: 1 }}
      />
    </svg>
  )
}

function recortar(texto, largo) {
  const limpio = String(texto || '')
  return limpio.length > largo ? `${limpio.slice(0, largo - 1)}…` : limpio
}
