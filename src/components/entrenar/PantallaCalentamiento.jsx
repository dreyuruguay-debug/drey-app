import { useEffect, useState } from 'react'
import RelojCircular from './RelojCircular.jsx'
import { formatearReloj } from '../../utils/entrenamiento.js'
import { relojDeActividad, resumenDeCalentamiento } from '../../utils/calentamiento.js'

// Primera parte del modo entrenar cuando el profe cargó un calentamiento.
// Se hace igual que un ejercicio: una actividad por vez (Cinta, Movilidad,
// Activación...), cada una con su reloj grande (el mismo del descanso,
// en naranja) y marcada con ✓ como una serie. Abajo, la lista completa:
// tocar una hecha la vuelve a abrir; tocar una pendiente la hace ahora.
//
// estado: ver utils/calentamiento.js. Esta pantalla no guarda nada: avisa
// lo que toca el alumno y RutinaDetalle actualiza el estado.
export default function PantallaCalentamiento({
  actividades,
  estado,
  onEmpezar,
  onPausar,
  onSumar,
  onCompletar,
  onElegir,
  onTiempoCumplido,
  onIrAEjercicios,
}) {
  const resumen = resumenDeCalentamiento(estado)
  const actividad = estado.actual >= 0 ? actividades[estado.actual] : null

  return (
    <div className="entrenar-pantalla calentamiento">
      {actividad ? (
        <>
          <div className="entrenar-encabezado">
            <span className="entrenar-etiqueta calentamiento-etiqueta">
              🔥 Calentamiento · {estado.actual + 1} de {resumen.total}
            </span>
            <h1 className="entrenar-titulo">{actividad.nombre}</h1>
            <p className="entrenar-objetivo">{actividad.duracion || 'A tu ritmo'}</p>
          </div>

          <RelojActividad
            key={estado.actual}
            actividad={actividad}
            indice={estado.actual}
            estado={estado}
            onEmpezar={onEmpezar}
            onPausar={onPausar}
            onSumar={onSumar}
            onCompletar={onCompletar}
            onTiempoCumplido={onTiempoCumplido}
          />

          {actividad.items?.length > 0 && (
            <div className="entrenar-tarjeta">
              <span className="entrenar-etiqueta-chica">Qué hacer</span>
              <ul className="actividad-items calentamiento-items">
                {actividad.items.map((item, posicion) => (
                  <li key={`${item}-${posicion}`}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <div className="calentamiento-completo">
          <span className="final-icono" aria-hidden="true">
            ✓
          </span>
          <h1 className="entrenar-titulo">Calentamiento completo</h1>
          <p className="entrenar-objetivo">Cuerpo listo. Ahora sí, a las series.</p>
          <button type="button" className="boton-principal" onClick={onIrAEjercicios}>
            Empezar los ejercicios
          </button>
        </div>
      )}

      <section className="calentamiento-lista">
        <span className="entrenar-etiqueta-chica">
          Tu calentamiento · {resumen.hechas} de {resumen.total}
        </span>
        <ol className="entrenar-series">
          {actividades.map((item, indice) => (
            <FilaActividad
              key={`${item.nombre}-${indice}`}
              actividad={item}
              hecha={estado.hechas[indice]}
              actual={indice === estado.actual}
              onElegir={() => onElegir(indice)}
            />
          ))}
        </ol>
      </section>

      <p className="calentamiento-nota">
        Es parte de tu entrenamiento: prepara músculos y articulaciones para rendir más y cuidarte
        de lesiones.
      </p>
    </div>
  )
}

// El reloj de la actividad abierta, con sus botones. Tiene su propio
// reloj (como Cronometro), así el resto de la pantalla no se vuelve a
// dibujar cada segundo. Si la actividad tiene tiempo, baja solo y al
// llegar a cero avisa (onTiempoCumplido); si no, cuenta hacia arriba.
function RelojActividad({
  actividad,
  indice,
  estado,
  onEmpezar,
  onPausar,
  onSumar,
  onCompletar,
  onTiempoCumplido,
}) {
  const corriendo = estado.desde !== null
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    if (!corriendo) return undefined
    setAhora(Date.now())
    const intervalo = setInterval(() => setAhora(Date.now()), 250)
    return () => clearInterval(intervalo)
  }, [corriendo])

  const reloj = relojDeActividad(actividad, estado, ahora)
  const conTiempo = reloj.objetivo !== null
  const empezada = corriendo || estado.acumulado > 0

  useEffect(() => {
    if (reloj.corriendo && reloj.cumplido) onTiempoCumplido(indice)
  }, [reloj.corriendo, reloj.cumplido, indice])

  let detalle = 'sin tiempo fijo'
  if (conTiempo) detalle = `de ${formatearReloj(reloj.objetivo)}`
  else if (empezada) detalle = 'a tu ritmo'

  return (
    <>
      <div className="calentamiento-reloj">
        <RelojCircular
          variante="calentamiento"
          proporcion={reloj.proporcion}
          valor={formatearReloj(conTiempo ? reloj.restante : reloj.corridos)}
          detalle={detalle}
        />
      </div>

      {conTiempo && (
        <div className="chips-lista calentamiento-sumar" aria-label="Sumar tiempo">
          <button type="button" className="chip" onClick={() => onSumar(30)}>
            +30 s
          </button>
          <button type="button" className="chip" onClick={() => onSumar(60)}>
            +1 min
          </button>
        </div>
      )}

      <div className="descanso-botones">
        {corriendo ? (
          <>
            {/* "Pausar reloj" para no confundirlo con "Pausar" de arriba
                (que pausa todo el entrenamiento y vuelve al inicio). */}
            <button type="button" className="boton-secundario" onClick={onPausar}>
              Pausar reloj
            </button>
            <button type="button" className="boton-principal" onClick={onCompletar}>
              ✓ Hecho
            </button>
          </>
        ) : (
          <>
            <button type="button" className="boton-secundario" onClick={onCompletar}>
              ✓ Ya lo hice
            </button>
            <button type="button" className="boton-principal" onClick={onEmpezar}>
              <IconoPlay />
              {empezada ? 'Seguir' : 'Empezar'}
            </button>
          </>
        )}
      </div>

      <p className="calentamiento-aviso">
        {conTiempo ? 'El celular vibra cuando se cumple el tiempo' : 'Tocá “Hecho” cuando termines'}
      </p>
    </>
  )
}

// Una actividad de la lista, con el mismo aspecto que una serie.
function FilaActividad({ actividad, hecha, actual, onElegir }) {
  let clase = 'entrenar-serie calentamiento-fila'
  let check = 'entrenar-check entrenar-check-vacio'
  let ayuda = `${actividad.nombre}, pendiente. Tocá para hacerla ahora`
  if (hecha) {
    clase = 'entrenar-serie entrenar-serie-hecha'
    check = 'entrenar-check'
    ayuda = `${actividad.nombre} hecha. Tocá para repetirla`
  } else if (actual) {
    clase = 'entrenar-serie calentamiento-fila calentamiento-fila-actual'
    check = 'entrenar-check entrenar-check-parcial calentamiento-check-actual'
    ayuda = `${actividad.nombre}, ahora`
  }

  return (
    <li>
      <button
        type="button"
        className={clase}
        onClick={actual ? undefined : onElegir}
        disabled={actual}
        aria-label={ayuda}
      >
        <span className={check}>{hecha ? '✓' : ''}</span>
        <span className="entrenar-serie-nombre">{actividad.nombre}</span>
        <span className="entrenar-serie-valor">{actual ? 'ahora' : actividad.duracion}</span>
      </button>
    </li>
  )
}

// Triángulo de "play" (el mismo del botón "Empezar entrenamiento" de
// Inicio). Dibujado, no con el símbolo ▶, que algunos celulares muestran
// como un emoji azul.
function IconoPlay() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
