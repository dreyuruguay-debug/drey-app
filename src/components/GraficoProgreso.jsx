import { formatearNumero } from '../utils/progreso.js'

// Gráfico simple de línea o de barras, dibujado a mano (SVG) para no
// sumar una librería pesada a la app. Se adapta al ancho de la pantalla.
//
// puntos: [{ etiqueta: 'Sem 1', valor: 100 }, ...]
// tipo: 'linea' (evolución de un valor) o 'barras' (totales por semana).

const ANCHO = 320
const ALTO = 170
const MARGEN = { arriba: 16, derecha: 12, abajo: 26, izquierda: 42 }

export default function GraficoProgreso({ puntos, tipo = 'linea', unidad = '', titulo }) {
  if (!puntos?.length) return <p className="profe-vacio">Todavía no hay datos para graficar.</p>

  const valores = puntos.map((punto) => punto.valor)
  const maximo = Math.max(...valores)
  const minimoReal = Math.min(...valores)
  // En barras el eje arranca en 0; en líneas se ajusta al rango para
  // que se note la subida (con un poco de aire arriba y abajo).
  const minimo =
    tipo === 'barras' ? 0 : Math.max(0, minimoReal - (maximo - minimoReal || maximo) * 0.2)
  const tope = maximo === minimo ? maximo + 1 : maximo + (maximo - minimo) * 0.1

  const anchoUtil = ANCHO - MARGEN.izquierda - MARGEN.derecha
  const altoUtil = ALTO - MARGEN.arriba - MARGEN.abajo
  const paso = puntos.length > 1 ? anchoUtil / (puntos.length - 1) : 0
  const anchoBarra = Math.min(34, (anchoUtil / puntos.length) * 0.6)

  const x = (indice) =>
    tipo === 'barras'
      ? MARGEN.izquierda + (anchoUtil / puntos.length) * (indice + 0.5)
      : MARGEN.izquierda + (puntos.length > 1 ? paso * indice : anchoUtil / 2)
  const y = (valor) => MARGEN.arriba + altoUtil - ((valor - minimo) / (tope - minimo)) * altoUtil

  // Si hay muchos puntos, no se escriben todas las etiquetas de abajo.
  const cadaCuanto = Math.ceil(puntos.length / 6)
  const formatear = (valor) => `${formatearNumero(valor)}${unidad}`

  return (
    <figure className="grafico">
      {titulo && <figcaption className="grafico-titulo">{titulo}</figcaption>}
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="grafico-svg" role="img" aria-label={titulo}>
        {[minimo, (minimo + tope) / 2, tope].map((valor) => (
          <g key={valor}>
            <line
              x1={MARGEN.izquierda}
              x2={ANCHO - MARGEN.derecha}
              y1={y(valor)}
              y2={y(valor)}
              className="grafico-guia"
            />
            <text
              x={MARGEN.izquierda - 6}
              y={y(valor) + 3}
              className="grafico-eje"
              textAnchor="end"
            >
              {formatearNumero(Math.round(valor))}
            </text>
          </g>
        ))}

        {tipo === 'barras' ? (
          puntos.map((punto, indice) => (
            <rect
              key={indice}
              x={x(indice) - anchoBarra / 2}
              y={y(punto.valor)}
              width={anchoBarra}
              height={Math.max(0, y(minimo) - y(punto.valor))}
              rx="4"
              className="grafico-barra"
            >
              <title>{`${punto.etiqueta}: ${formatear(punto.valor)}`}</title>
            </rect>
          ))
        ) : (
          <>
            <polyline
              points={puntos.map((punto, indice) => `${x(indice)},${y(punto.valor)}`).join(' ')}
              className="grafico-linea"
            />
            {puntos.map((punto, indice) => (
              <circle
                key={indice}
                cx={x(indice)}
                cy={y(punto.valor)}
                r="3.5"
                className="grafico-punto"
              >
                <title>{`${punto.etiqueta}: ${formatear(punto.valor)}`}</title>
              </circle>
            ))}
          </>
        )}

        {puntos.map((punto, indice) =>
          indice % cadaCuanto === 0 || indice === puntos.length - 1 ? (
            <text
              key={indice}
              x={x(indice)}
              y={ALTO - 8}
              className="grafico-eje"
              textAnchor="middle"
            >
              {punto.etiqueta}
            </text>
          ) : null,
        )}
      </svg>
    </figure>
  )
}
