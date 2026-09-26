// Siluetas grises con la forma de la pantalla, mientras llegan los datos
// (en vez del texto "Cargando…"). La pantalla se siente más rápida porque
// ya se ve dónde va a ir cada cosa.
//
// tipo:
//   · 'lista'    — tarjetas una debajo de la otra (la más usada).
//   · 'inicio'   — Inicio del alumno: saludo, semana y "Hoy te toca".
//   · 'pantalla' — un título y una lista (cuando todavía no se sabe nada
//                  de la pantalla).
//   · 'linea'    — una sola línea chica, para una parte de la pantalla.
// filas: cuántas tarjetas mostrar en 'lista' y 'pantalla'.
export default function Esqueleto({ tipo = 'lista', filas = 3 }) {
  return (
    <div className={`esqueleto esqueleto-${tipo}`} role="status" aria-busy="true" aria-label="Cargando…">
      {tipo === 'linea' && <Bloque clase="esqueleto-linea" />}

      {tipo === 'inicio' && (
        <>
          <Bloque clase="esqueleto-linea esqueleto-corta" />
          <Bloque clase="esqueleto-titulo" />
          <div className="esqueleto-semana">
            {Array.from({ length: 7 }, (_, indice) => (
              <Bloque key={indice} clase="esqueleto-punto" />
            ))}
          </div>
          <Bloque clase="esqueleto-tarjeta-grande" />
          <Bloque clase="esqueleto-tarjeta" />
        </>
      )}

      {tipo === 'pantalla' && <Bloque clase="esqueleto-titulo" />}

      {(tipo === 'lista' || tipo === 'pantalla') &&
        Array.from({ length: filas }, (_, indice) => (
          <Bloque key={indice} clase="esqueleto-tarjeta" />
        ))}
    </div>
  )
}

function Bloque({ clase }) {
  return <span className={`esqueleto-bloque ${clase}`} aria-hidden="true" />
}
