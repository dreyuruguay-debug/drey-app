import { useState } from 'react'

// Bienvenida de 3 pantallas que ve el cliente la primera vez que entra a
// Inicio (y cuando la pide de nuevo desde Perfil). Explica en pocas
// palabras cómo funciona la app. Se puede saltear.
const PANTALLAS = [
  {
    titulo: 'Bienvenido a DREY',
    texto:
      'Tu profe arma tus rutinas a medida. Vos las seguís desde el celular, en el gimnasio o donde entrenes.',
    dibujo: 'inicio',
  },
  {
    titulo: 'Tu rutina, paso a paso',
    texto:
      'La hacés de a un ejercicio: cargás el peso, marcás cada serie y la app te avisa cuándo descansar.',
    dibujo: 'series',
  },
  {
    titulo: 'Mirá cómo progresás',
    texto:
      'Cada entrenamiento queda guardado: vas a ver tus récords, tus gráficas y un resumen de tu profe cada 4 semanas.',
    dibujo: 'progreso',
  },
]

export default function Bienvenida({ onTerminar }) {
  const [indice, setIndice] = useState(0)
  const pantalla = PANTALLAS[indice]
  const esUltima = indice === PANTALLAS.length - 1

  return (
    <div className="bienvenida" role="dialog" aria-modal="true" aria-label="Bienvenida">
      <div className="bienvenida-cabecera">
        <span className="bienvenida-marca">DREY</span>
        <button type="button" className="bienvenida-saltar" onClick={onTerminar}>
          Saltar
        </button>
      </div>

      <div className="bienvenida-dibujo" aria-hidden="true">
        <Dibujo tipo={pantalla.dibujo} />
      </div>

      <div className="bienvenida-textos">
        <h1 className="bienvenida-titulo">{pantalla.titulo}</h1>
        <p className="bienvenida-texto">{pantalla.texto}</p>
      </div>

      <div className="bienvenida-puntos" aria-label={`Paso ${indice + 1} de ${PANTALLAS.length}`}>
        {PANTALLAS.map((item, posicion) => (
          <span
            key={item.titulo}
            className={
              posicion === indice ? 'bienvenida-punto bienvenida-punto-activo' : 'bienvenida-punto'
            }
          />
        ))}
      </div>

      <button
        type="button"
        className="boton-principal"
        onClick={() => (esUltima ? onTerminar() : setIndice(indice + 1))}
      >
        {esUltima ? 'Empezar' : 'Siguiente'}
      </button>
    </div>
  )
}

// Dibujitos simples hechos con cajas, sin imágenes (cargan al instante).
function Dibujo({ tipo }) {
  if (tipo === 'series') {
    return (
      <div className="dibujo-celular">
        <span className="dibujo-linea dibujo-linea-corta" />
        <span className="dibujo-foto" />
        <span className="dibujo-fila dibujo-fila-hecha">
          <span className="dibujo-check" />
          <span className="dibujo-linea" />
        </span>
        <span className="dibujo-fila dibujo-fila-actual">
          <span className="dibujo-check dibujo-check-vacio" />
          <span className="dibujo-linea" />
        </span>
        <span className="dibujo-fila">
          <span className="dibujo-check dibujo-check-vacio" />
          <span className="dibujo-linea" />
        </span>
        <span className="dibujo-boton" />
      </div>
    )
  }
  if (tipo === 'progreso') {
    return (
      <div className="dibujo-celular">
        <span className="dibujo-linea dibujo-linea-corta" />
        <div className="dibujo-barras">
          {[30, 45, 40, 60, 72, 90].map((alto) => (
            <span key={alto} className="dibujo-barra" style={{ height: `${alto}%` }} />
          ))}
        </div>
        <span className="dibujo-fila dibujo-fila-hecha">
          <span className="dibujo-check" />
          <span className="dibujo-linea" />
        </span>
      </div>
    )
  }
  return (
    <div className="dibujo-celular">
      <span className="dibujo-linea dibujo-linea-corta" />
      <div className="dibujo-semana">
        {[1, 2, 3, 4, 5, 6, 7].map((dia) => (
          <span key={dia} className={dia < 3 ? 'dibujo-dia dibujo-dia-hecho' : 'dibujo-dia'} />
        ))}
      </div>
      <span className="dibujo-tarjeta" />
      <span className="dibujo-boton" />
    </div>
  )
}
