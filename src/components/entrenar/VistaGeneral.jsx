import SeccionActividades from '../SeccionActividades.jsx'
import InfoMetodo from '../InfoMetodo.jsx'
import { tituloDeBloque } from '../../utils/bloques.js'
import { estadoDeEjercicio } from '../../utils/entrenamiento.js'
import { textoDescanso, textoRango } from '../../utils/formatos.js'

// La rutina completa de un vistazo (lo que se abre con "Ver toda la
// rutina"): calentamiento, bloques con sus ejercicios y cuánto lleva
// hecho de cada uno, pausa y vuelta a la calma. Tocar un ejercicio lleva
// directo a él.
export default function VistaGeneral({
  rutina,
  bloques,
  series,
  empezado,
  onElegir,
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

      {rutina.calentamiento?.length > 0 && (
        <section className="entrenar-tarjeta">
          <span className="entrenar-etiqueta-chica">Calentamiento</span>
          <SeccionActividades actividades={rutina.calentamiento} />
        </section>
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
                        : estado.hechas
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
