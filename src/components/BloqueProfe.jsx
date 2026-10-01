import { obtenerMetodo } from '../data/metodos.js'
import { tituloDeBloque } from '../utils/bloques.js'
import { textoDescanso } from '../utils/formatos.js'
import { textoSeriesCalentamiento } from '../utils/seriesCalentamiento.js'
import InfoMetodo from './InfoMetodo.jsx'
import ObjetivoEjercicio from './ObjetivoEjercicio.jsx'

// Un bloque de la rutina en el editor del profe. Se ve igual que en la
// rutina del cliente (mismo título, mismos ejercicios y mismos datos),
// pero con los controles para subirlo, bajarlo, editarlo, duplicarlo o
// quitarlo.
//
// idsArchivados: ejercicios archivados en la biblioteca (supabase/sql/024).
// Siguen en la rutina, con la etiqueta "Archivado" al lado del nombre.
// semanasCiclo: semanas del ciclo de la rutina (para mostrar cada semana).
// onEditarCalentamiento(posicion): abre el editor del bloque directo en
// las series de calentamiento de ese ejercicio (cada ejercicio tiene las
// suyas, con sus reps y su peso).
export default function BloqueProfe({
  bloque,
  idsArchivados,
  semanasCiclo = 0,
  esPrimero,
  esUltimo,
  onMover,
  onEditar,
  onQuitar,
  onDuplicar,
  onEditarCalentamiento,
}) {
  const metodo = obtenerMetodo(bloque.metodo)
  const instruccion = metodo.instruccion(bloque.config || {})
  const esGrupo = bloque.items.length > 1
  const ultimo = bloque.items[bloque.items.length - 1].item
  const descanso = textoDescanso(ultimo)

  return (
    <div className={esGrupo ? 'bloque-profe bloque-grupo' : 'bloque-profe'}>
      <div className="bloque-cabecera bloque-profe-cabecera">
        <div className="bloque-cabecera-titulo">
          <span>{tituloDeBloque(bloque)}</span>
          <InfoMetodo metodoId={bloque.metodo} />
        </div>
        <div className="editor-ejercicio-acciones">
          <button
            type="button"
            className="editor-mover"
            onClick={() => onMover(-1)}
            disabled={esPrimero}
            aria-label="Subir bloque"
          >
            ↑
          </button>
          <button
            type="button"
            className="editor-mover"
            onClick={() => onMover(1)}
            disabled={esUltimo}
            aria-label="Bajar bloque"
          >
            ↓
          </button>
          <button type="button" className="profe-ejercicio-agregar" onClick={onEditar}>
            Editar
          </button>
          <button type="button" className="profe-ejercicio-agregar" onClick={onDuplicar}>
            Duplicar
          </button>
          <button type="button" className="profe-ejercicio-borrar" onClick={onQuitar}>
            Quitar
          </button>
        </div>
      </div>
      {instruccion && <p className="bloque-instruccion bloque-profe-instruccion">{instruccion}</p>}

      {bloque.items.map(({ item }, posicion) => (
        <div key={item.id || `${item.ejercicio_id}-${posicion}`} className="ejercicio-bloque">
          <div className="ejercicio-header">
            <span>{item.ejercicios?.nombre || 'Ejercicio borrado de la biblioteca'}</span>
            {idsArchivados?.has(item.ejercicio_id) && (
              <span className="estado-chip estado-alerta estado-chip-chico">Archivado</span>
            )}
          </div>
          <ObjetivoEjercicio ejercicio={item} semanasCiclo={semanasCiclo} />
          {onEditarCalentamiento && (
            <button
              type="button"
              className={
                textoSeriesCalentamiento(item.calentamiento)
                  ? 'boton-calentamiento boton-calentamiento-cambiar'
                  : 'boton-calentamiento'
              }
              onClick={() => onEditarCalentamiento(posicion)}
            >
              {textoSeriesCalentamiento(item.calentamiento)
                ? 'Cambiar series de calentamiento'
                : '+ Series de calentamiento'}
            </button>
          )}
        </div>
      ))}

      {descanso && (
        <p className="bloque-descanso">
          {esGrupo ? 'Descanso al terminar el bloque' : 'Descanso'}: {descanso}
        </p>
      )}
    </div>
  )
}
