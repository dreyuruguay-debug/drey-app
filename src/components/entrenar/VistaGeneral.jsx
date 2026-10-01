import { useMemo, useState } from 'react'
import SeccionActividades from '../SeccionActividades.jsx'
import InfoMetodo from '../InfoMetodo.jsx'
import VisorEjercicios from '../VisorEjercicios.jsx'
import { tituloDeBloque } from '../../utils/bloques.js'
import { estadoDeEjercicio, estimarMinutos } from '../../utils/entrenamiento.js'
import { resumenDeCalentamiento } from '../../utils/calentamiento.js'
import { textoDescanso, textoRango } from '../../utils/formatos.js'
import { textoSeriesCalentamiento } from '../../utils/seriesCalentamiento.js'
import { semanaDelCiclo } from '../../utils/ciclos.js'
import { formatearNumero } from '../../utils/progreso.js'
import { obtenerFechaHoyISO } from '../../utils/dias.js'
import { miniaturaDeEjercicio } from '../../utils/imagenes.js'

// La rutina completa de un vistazo. Se abre al tocar una rutina en "Mis
// rutinas", con "Ver la rutina antes de empezar" (Inicio) y con "Ver toda
// la rutina" mientras entrena. Muestra todo sin tener que empezar:
// cuántos ejercicios y minutos, el calentamiento, cada bloque con la foto
// de cada ejercicio (tocándola se ve la animación en grande), series ×
// repeticiones, peso, RPE, tempo, las series de calentamiento y las notas
// del profe, la pausa y la vuelta a la calma. Si ya empezó, también
// cuánto lleva hecho de cada uno. Tocar un ejercicio o una actividad
// lleva directo a él.
export default function VistaGeneral({
  rutina,
  bloques,
  series,
  calentamiento,
  empezado,
  onElegir,
  onElegirCalentamiento,
  onCerrar,
  onTerminar,
}) {
  const pausa = textoRango(rutina.pausa_min, rutina.pausa_max)
  const items = useMemo(() => bloques.flatMap((bloque) => bloque.items), [bloques])
  // Los ejercicios con foto, en orden, para verlos en grande y pasar al
  // siguiente sin cerrar.
  const conFoto = useMemo(
    () =>
      items
        .filter(({ item }) => item.ejercicios?.imagen_url)
        .map(({ item, indice }) => ({ ...item.ejercicios, id: item.id || `ejercicio-${indice}` })),
    [items],
  )
  const [visor, setVisor] = useState(null)
  const minutos = estimarMinutos(
    rutina,
    items.map(({ item }) => item),
  )
  const ciclo = semanaDelCiclo(rutina, obtenerFechaHoyISO())

  function verFoto(item, indice) {
    const id = item.id || `ejercicio-${indice}`
    setVisor(conFoto.findIndex((ejercicio) => ejercicio.id === id))
  }

  return (
    <div className="vista-general" role="dialog" aria-modal="true" aria-label="Rutina completa">
      <div className="vista-general-cabecera">
        <div>
          <span className="entrenar-etiqueta-chica">Rutina completa</span>
          <h1 className="vista-general-titulo">{rutina.nombre}</h1>
          {rutina.musculos && <p className="entrenar-objetivo">{rutina.musculos}</p>}
        </div>
        <button type="button" className="asistente-cerrar" onClick={onCerrar} aria-label="Cerrar">
          ✕
        </button>
      </div>

      <div className="chips-lista">
        <span className="chip chip-dato">
          {items.length} {items.length === 1 ? 'ejercicio' : 'ejercicios'}
        </span>
        {minutos > 0 && <span className="chip chip-dato">~{minutos} min</span>}
        {ciclo && !ciclo.terminado && (
          <span className="chip chip-dato">
            Semana {ciclo.semana} de {ciclo.total}
          </span>
        )}
      </div>

      {rutina.descripcion && <p className="vista-general-descripcion">{rutina.descripcion}</p>}

      {rutina.calentamiento?.length > 0 && calentamiento && (
        <BloqueCalentamiento
          actividades={rutina.calentamiento}
          estado={calentamiento}
          onElegir={onElegirCalentamiento}
        />
      )}

      {bloques.map((bloque) => {
        const esGrupo = bloque.items.length > 1
        const descanso = textoDescanso(bloque.items[bloque.items.length - 1].item)
        return (
          <section
            key={bloque.items[0].item.id || bloque.numero}
            className={esGrupo ? 'entrenar-tarjeta vista-general-grupo' : 'entrenar-tarjeta'}
          >
            <div className="vista-general-bloque">
              <span>{tituloDeBloque(bloque)}</span>
              <InfoMetodo metodoId={bloque.metodo} />
            </div>
            {bloque.items.map(({ item, indice }) => (
              <EjercicioDeLaRutina
                key={item.id || indice}
                item={item}
                estado={estadoDeEjercicio(series[indice])}
                empezado={empezado}
                onVerFoto={() => verFoto(item, indice)}
                onElegir={() => onElegir(indice)}
              />
            ))}
            {descanso && (
              <p className="bloque-descanso">
                {esGrupo ? 'Descanso al terminar el bloque' : 'Descanso'}: {descanso}
              </p>
            )}
          </section>
        )
      })}

      {pausa && (
        <p className="vista-general-pausa">
          Pausa entre ejercicios: <strong>{pausa}</strong>
        </p>
      )}

      {rutina.vuelta_calma?.length > 0 && (
        <section className="entrenar-tarjeta">
          <span className="entrenar-etiqueta-chica">Vuelta a la calma</span>
          <SeccionActividades actividades={rutina.vuelta_calma} />
        </section>
      )}

      <div className="vista-general-botones">
        <button type="button" className="boton-principal" onClick={onCerrar}>
          {empezado ? 'Seguir entrenando' : 'Empezar'}
        </button>
        {empezado && (
          <button type="button" className="boton-texto" onClick={onTerminar}>
            Terminar el entrenamiento ahora
          </button>
        )}
      </div>

      {visor !== null && conFoto[visor] && (
        <VisorEjercicios
          ejercicios={conFoto}
          indice={visor}
          onCambiar={setVisor}
          onCerrar={() => setVisor(null)}
        />
      )}
    </div>
  )
}

// Un ejercicio de la rutina: la foto (tocándola se ve en grande) y todo
// lo que pidió el profe. Tocar el texto lleva al ejercicio.
function EjercicioDeLaRutina({ item, estado, empezado, onVerFoto, onElegir }) {
  const datos = item.ejercicios || {}
  const calentamiento = textoSeriesCalentamiento(item.calentamiento)
  const objetivo = [
    `${item.series} × ${item.reps_objetivo || '—'}`,
    item.kg_objetivo ? `${formatearNumero(Number(item.kg_objetivo))} kg` : '',
    item.rpe ? `RPE ${item.rpe}` : '',
    item.tempo ? `Tempo ${item.tempo}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="vista-general-ejercicio vista-general-ejercicio-con-foto">
      {datos.imagen_url ? (
        <button
          type="button"
          className="vista-general-foto"
          onClick={onVerFoto}
          aria-label={`Ver en grande: ${datos.nombre || 'el ejercicio'}`}
        >
          <img src={miniaturaDeEjercicio(datos.imagen_url)} alt="" loading="lazy" />
          {estado.completo && <span className="vista-general-foto-check">✓</span>}
        </button>
      ) : (
        <span className="vista-general-foto vista-general-foto-vacia" aria-hidden="true">
          {estado.completo ? '✓' : ''}
        </span>
      )}
      <button type="button" className="vista-general-ejercicio-boton" onClick={onElegir}>
        <span className="vista-general-ejercicio-texto">
          <strong>{datos.nombre || 'Ejercicio'}</strong>
          <small>{objetivo}</small>
          {calentamiento && (
            <small className="vista-general-calentamiento-series">
              Calentamiento: {calentamiento}
              {empezado && estado.calentamientoTotal > 0
                ? ` (${estado.calentamientoHechas}/${estado.calentamientoTotal} hechas)`
                : ''}
            </small>
          )}
          {item.notas && <small className="vista-general-notas">📝 {item.notas}</small>}
        </span>
        {empezado && (
          <span className="vista-general-ejercicio-estado">
            {estado.hechas}/{estado.total}
          </span>
        )}
      </button>
    </div>
  )
}

// El calentamiento como un bloque más: cada actividad con su ✓.
function BloqueCalentamiento({ actividades, estado, onElegir }) {
  const resumen = resumenDeCalentamiento(estado)
  return (
    <section className="entrenar-tarjeta vista-general-calentamiento">
      <div className="vista-general-bloque">
        <span>🔥 Calentamiento</span>
        <span className="vista-general-bloque-estado">
          {resumen.hechas}/{resumen.total}
        </span>
      </div>
      {actividades.map((actividad, indice) => {
        const hecha = estado.hechas[indice]
        return (
          <button
            key={`${actividad.nombre}-${indice}`}
            type="button"
            className="vista-general-ejercicio"
            onClick={() => onElegir(indice)}
          >
            <span className={hecha ? 'entrenar-check' : 'entrenar-check entrenar-check-vacio'}>
              {hecha ? '✓' : ''}
            </span>
            <span className="vista-general-ejercicio-texto">
              <strong>{actividad.nombre}</strong>
              {actividad.items?.length > 0 && <small>{actividad.items.join(' · ')}</small>}
            </span>
            <span className="vista-general-ejercicio-estado">{actividad.duracion}</span>
          </button>
        )
      })}
    </section>
  )
}
