import { useMemo, useState } from 'react'
import { CATEGORIAS } from '../../data/categorias.js'
import { ejerciciosActivos, filtrarPorBusqueda } from '../../utils/biblioteca.js'

const RESULTADOS = 8

// "Ejercicios para revisar": los de la planilla que no están en la
// biblioteca (o hay varios con ese nombre). Para cada uno, el profe elige:
//   · Usar uno de la biblioteca (se le proponen los más parecidos), o
//   · Crear un ejercicio nuevo (con su categoría).
// La decisión vale para todos los renglones con ese nombre. Abajo quedan
// los ya resueltos, con "Cambiar" para deshacer.
// onResolver(clave, resolucion | null)
export default function ResolverEjercicios({ desconocidos, resoluciones, biblioteca, onResolver }) {
  const resueltos = Object.entries(resoluciones)
  if (!desconocidos.length && !resueltos.length) return null
  const porId = new Map(biblioteca.map((ejercicio) => [ejercicio.id, ejercicio]))

  return (
    <div className="planilla-revisar">
      <p className="planilla-mensajes-titulo">Ejercicios para revisar</p>
      {desconocidos.map((desconocido) => (
        <Desconocido
          key={desconocido.clave}
          desconocido={desconocido}
          biblioteca={biblioteca}
          onResolver={(resolucion) => onResolver(desconocido.clave, resolucion)}
        />
      ))}
      {resueltos.length > 0 && (
        <ul className="planilla-resueltos">
          {resueltos.map(([clave, resolucion]) => (
            <li key={clave}>
              <span>
                “{resolucion.nombre}” →{' '}
                {resolucion.tipo === 'crear'
                  ? `se crea en la biblioteca (${resolucion.categoria})`
                  : `“${porId.get(resolucion.ejercicioId)?.nombre || 'ejercicio elegido'}”`}
              </span>
              <button
                type="button"
                className="profe-ejercicio-agregar"
                onClick={() => onResolver(clave, null)}
              >
                Cambiar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Desconocido({ desconocido, biblioteca, onResolver }) {
  const [modo, setModo] = useState(desconocido.opciones.length ? 'usar' : 'crear')
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState('')
  const activos = useMemo(() => ejerciciosActivos(biblioteca), [biblioteca])
  const opciones = busqueda.trim()
    ? filtrarPorBusqueda(activos, busqueda).slice(0, RESULTADOS)
    : desconocido.opciones
  const filas = desconocido.filas
  const textoFilas =
    filas.length === 1
      ? `fila ${filas[0]}`
      : `filas ${filas.slice(0, 5).join(', ')}${filas.length > 5 ? '…' : ''}`

  return (
    <div className="planilla-desconocido">
      <p className="planilla-desconocido-nombre">
        <strong>“{desconocido.nombre}”</strong> <small>({textoFilas})</small>
      </p>
      <p className="profe-nota planilla-nota">
        {desconocido.motivo === 'ambiguo'
          ? 'Hay varios ejercicios con ese nombre: elegí cuál es.'
          : 'No está en la biblioteca.'}
      </p>
      <div className="chips-lista">
        <button
          type="button"
          className={modo === 'usar' ? 'chip chip-activo' : 'chip'}
          aria-pressed={modo === 'usar'}
          onClick={() => setModo('usar')}
        >
          Usar uno de la biblioteca
        </button>
        {desconocido.motivo !== 'ambiguo' && (
          <button
            type="button"
            className={modo === 'crear' ? 'chip chip-activo' : 'chip'}
            aria-pressed={modo === 'crear'}
            onClick={() => setModo('crear')}
          >
            Crear ejercicio nuevo
          </button>
        )}
      </div>

      {modo === 'usar' ? (
        <div className="planilla-opciones">
          <input
            className="auth-input"
            type="search"
            placeholder="Buscar en la biblioteca…"
            aria-label={`Buscar un ejercicio para "${desconocido.nombre}"`}
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
          />
          {opciones.length ? (
            opciones.map((ejercicio) => (
              <button
                key={ejercicio.id}
                type="button"
                className="planilla-opcion"
                onClick={() =>
                  onResolver({
                    tipo: 'vincular',
                    ejercicioId: ejercicio.id,
                    nombre: desconocido.nombre,
                  })
                }
              >
                <span>{ejercicio.nombre}</span>
                <small>{ejercicio.grupo_muscular}</small>
              </button>
            ))
          ) : (
            <p className="profe-vacio">
              {busqueda.trim()
                ? 'No encontramos ejercicios con ese nombre.'
                : 'Buscalo por su nombre.'}
            </p>
          )}
        </div>
      ) : (
        <div className="planilla-opciones">
          <label className="editor-campo">
            <span>Categoría del ejercicio nuevo</span>
            <select
              className="profe-calendario-select"
              value={categoria}
              onChange={(event) => setCategoria(event.target.value)}
            >
              <option value="">Elegí una…</option>
              {CATEGORIAS.map((opcion) => (
                <option key={opcion.nombre} value={opcion.nombre}>
                  {opcion.nombre}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="boton-secundario boton-chico"
            disabled={!categoria}
            onClick={() => onResolver({ tipo: 'crear', categoria, nombre: desconocido.nombre })}
          >
            Crear “{desconocido.nombre}” al importar
          </button>
          <p className="profe-nota planilla-nota">
            Se agrega a la biblioteca cuando confirmes. Después le podés poner foto y video.
          </p>
        </div>
      )}
    </div>
  )
}
