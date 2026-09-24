import { obtenerMetodo } from '../data/metodos.js'
import { tituloDeBloque } from '../utils/bloques.js'
import { textoDescanso } from '../utils/formatos.js'
import InfoMetodo from './InfoMetodo.jsx'
import ObjetivoEjercicio from './ObjetivoEjercicio.jsx'

// Un bloque de la rutina en el editor del profe. Se ve igual que en la
// rutina del cliente (mismo título, mismos ejercicios y mismos datos),
// pero con los controles para subirlo, bajarlo, editarlo o quitarlo.
export default function BloqueProfe({ bloque, esPrimero, esUltimo, onMover, onEditar, onQuitar }) {
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
          </div>
          <ObjetivoEjercicio ejercicio={item} />
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
