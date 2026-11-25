import { useState } from 'react'
import { formatearNumero } from '../utils/progreso.js'

// Gráfico simple de línea o de barras, dibujado a mano (SVG) para no
// sumar una librería pesada a la app. Se adapta al ancho de la pantalla.
//
// puntos: [{ etiqueta: 'Sem 1', valor: 100 }, ...]
// tipo: 'linea' (evolución de un valor) o 'barras' (totales por semana).
//
// Al tocar un punto o una barra (o pasar el mouse en la compu) aparece un
// globito con el valor y la etiqueta ("75 kg · 10/11"). Tocando otro
// punto se pasa a ese; se cierra tocando fuera de los puntos (los
// números de la izquierda o las fechas de abajo) o, con el mouse, al
// salir del gráfico. Con el
// teclado: Tab hasta el gráfico y las flechas ← → recorren los puntos.

const ANCHO = 320
const ALTO = 170
const MARGEN = { arriba: 16, derecha: 12, abajo: 26, izquierda: 42 }
// Lugar para tocar cada punto con el dedo (en unidades del dibujo, que en
// el celular son casi píxeles).
const RADIO_TOQUE = 16
// Medidas del globito.
const ALTO_GLOBO = 24
const LETRA_GLOBO = 6.6 // ancho aproximado de cada letra
const SEPARACION_GLOBO = 10

export default function GraficoProgreso({ puntos, tipo = 'linea', unidad = '', titulo }) {
  if (!puntos?.length) return <p className="profe-vacio">Todavía no hay datos para graficar.</p>
  return <Grafico puntos={puntos} tipo={tipo} unidad={unidad} titulo={titulo} />
}

function Grafico({ puntos, tipo, unidad, titulo }) {
  const [elegido, setElegido] = useState(null)

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
  const anchoColumna = anchoUtil / puntos.length
  const anchoBarra = Math.min(34, anchoColumna * 0.6)

  const x = (indice) =>
    tipo === 'barras'
      ? MARGEN.izquierda + anchoColumna * (indice + 0.5)
      : MARGEN.izquierda + (puntos.length > 1 ? paso * indice : anchoUtil / 2)
  const y = (valor) => MARGEN.arriba + altoUtil - ((valor - minimo) / (tope - minimo)) * altoUtil

  // Si hay muchos puntos, no se escriben todas las etiquetas de abajo.
  const cadaCuanto = Math.ceil(puntos.length / 6)
  const formatear = (valor) => `${formatearNumero(valor)}${unidad}`
  const textoDe = (punto) => `${formatear(punto.valor)} · ${punto.etiqueta}`

  // Si la lista cambia y el elegido ya no existe, no se muestra.
  const actual = elegido !== null && elegido < puntos.length ? elegido : null

  function tocar(indice, event) {
    event.stopPropagation()
    setElegido(indice)
  }

  // En la compu, pasar el mouse también lo muestra (en el celular
  // manda el toque).
  function pasarMouse(indice, event) {
    if (event.pointerType === 'mouse') setElegido(indice)
  }

  function alApretarTecla(event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const sumar = event.key === 'ArrowRight' ? 1 : -1
      setElegido((anterior) => {
        if (anterior === null) return sumar === 1 ? 0 : puntos.length - 1
        return Math.min(puntos.length - 1, Math.max(0, anterior + sumar))
      })
    }
    if (event.key === 'Escape') setElegido(null)
  }

  return (
    <figure className="grafico">
      {titulo && <figcaption className="grafico-titulo">{titulo}</figcaption>}
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="grafico-svg"
        role="img"
        aria-label={titulo}
        tabIndex={0}
        onClick={() => setElegido(null)}
        onKeyDown={alApretarTecla}
        onPointerLeave={(event) => event.pointerType === 'mouse' && setElegido(null)}
      >
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
              className={indice === actual ? 'grafico-barra grafico-barra-elegida' : 'grafico-barra'}
            />
          ))
        ) : (
          <>
            <polyline
              points={puntos.map((punto, indice) => `${x(indice)},${y(punto.valor)}`).join(' ')}
              className="grafico-linea"
            />
            {actual !== null && (
              <line
                x1={x(actual)}
                x2={x(actual)}
                y1={y(puntos[actual].valor)}
                y2={y(minimo)}
                className="grafico-marca"
              />
            )}
            {puntos.map((punto, indice) => (
              <circle
                key={indice}
                cx={x(indice)}
                cy={y(punto.valor)}
                r={indice === actual ? 6 : 3.5}
                className="grafico-punto"
              />
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

        {/* Zonas invisibles para tocar: una columna entera por punto, así
            se acierta fácil con el dedo aunque los puntos sean chicos. */}
        {puntos.map((_, indice) => (
          <rect
            key={`toque-${indice}`}
            x={x(indice) - Math.max(RADIO_TOQUE, (tipo === 'barras' ? anchoColumna : paso) / 2)}
            y={MARGEN.arriba - 8}
            width={Math.max(RADIO_TOQUE * 2, tipo === 'barras' ? anchoColumna : paso)}
            height={altoUtil + 16}
            className="grafico-toque"
            onClick={(event) => tocar(indice, event)}
            onPointerEnter={(event) => pasarMouse(indice, event)}
          />
        ))}

        {actual !== null && (
          <Globo
            texto={textoDe(puntos[actual])}
            puntoX={x(actual)}
            puntoY={y(puntos[actual].valor)}
          />
        )}
      </svg>
      {/* Para el lector de pantalla: lo que dice el globito. */}
      <p className="solo-lector" aria-live="polite">
        {actual !== null ? textoDe(puntos[actual]) : ''}
      </p>
    </figure>
  )
}

// El globito: arriba del punto (abajo si no entra) y sin salirse de los
// costados del gráfico.
function Globo({ texto, puntoX, puntoY }) {
  const ancho = Math.round(texto.length * LETRA_GLOBO + 18)
  const izquierda = Math.min(Math.max(puntoX - ancho / 2, 2), ANCHO - ancho - 2)
  const arriba =
    puntoY - SEPARACION_GLOBO - ALTO_GLOBO >= 0
      ? puntoY - SEPARACION_GLOBO - ALTO_GLOBO
      : puntoY + SEPARACION_GLOBO
  return (
    <g className="grafico-globo" pointerEvents="none">
      <rect x={izquierda} y={arriba} width={ancho} height={ALTO_GLOBO} rx="8" />
      <text x={izquierda + ancho / 2} y={arriba + ALTO_GLOBO / 2 + 4} textAnchor="middle">
        {texto}
      </text>
    </g>
  )
}
