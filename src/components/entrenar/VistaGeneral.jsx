import SeccionActividades from '../SeccionActividades.jsx'
import InfoMetodo from '../InfoMetodo.jsx'
import { tituloDeBloque } from '../../utils/bloques.js'
import { estadoDeEjercicio } from '../../utils/entrenamiento.js'
import { resumenDeCalentamiento } from '../../utils/calentamiento.js'
import { textoDescanso, textoRango } from '../../utils/formatos.js'

// La rutina completa de un vistazo (lo que se abre con "Ver toda la
// rutina"): calentamiento, bloques con sus ejercicios y cuánto lleva
// hecho de cada uno, pausa y vuelta a la calma. El calentamiento se ve
// igual que un bloque, con ✓ en cada actividad hecha. Tocar un ejercicio
// o una actividad lleva directo a él.
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
            {bloque.items.map(({ item, indice }) => {
              const estado = estadoDeEjercicio(series[indice])
              return (
                <button
                  key={item.id || indice}
                  type="button"
                  className="vista-general-ejercicio"
                  onClick={() => onElegir(indice)}
                >
                  <span
                    className={
                      estado.completo
                        ? 'entrenar-check'
                        : estado.empezado
                          ? 'entrenar-check entrenar-check-parcial'
                          : 'entrenar-check entrenar-check-vacio'
                    }
                  >
                    {estado.completo ? '✓' : ''}
                  </span>
                  <span className="vista-general-ejercicio-texto">
                    <strong>{item.ejercicios?.nombre || 'Ejercicio'}</strong>
                    <small>
                      {item.series} × {item.reps_objetivo || '—'}
                      {item.kg_objetivo ? ` · ${item.kg_objetivo} kg` : ''}
                      {estado.calentamientoTotal > 0 && (
                        <span className="vista-general-calentamiento-series">
                          {' · '}
                          {estado.calentamientoHechas}/{estado.calentamientoTotal} de calentamiento
                        </span>
                      )}
                    </small>
                  </span>
                  <span className="vista-general-ejercicio-estado">
                    {estado.hechas}/{estado.total}
                  </span>
                </button>
              )
            })}
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
