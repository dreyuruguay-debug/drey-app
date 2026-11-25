import { useEffect, useMemo, useState } from 'react'
import { clientesDelEspacio } from '../services/espacio.js'
import { copiarAVariosAlumnos } from '../services/rutinas.js'
import { obtenerFechaHoyISO } from '../utils/dias.js'
import { normalizarTexto } from '../utils/texto.js'
import Esqueleto from './Esqueleto.jsx'
import { mostrarAviso } from '../services/avisos.js'

// Ventana "Copiar a otros alumnos": se eligen varios alumnos (con
// buscador y "Elegir todos") y a cada uno le queda su propia copia de la
// rutina o plantilla. La original no cambia. Los días de la semana se
// eligen después, en la ficha de cada alumno (o en "La semana de todos").
//
//   tipo: 'rutina' | 'plantilla' · origen: la rutina o plantilla (con id)
//   sinCliente: el alumno dueño de la rutina (no aparece en la lista)
//   onListo({ copiadas, fallidas }) · onCerrar
export default function CopiarAVariosAlumnos({ tipo, origen, sinCliente, onListo, onCerrar }) {
  const [cargando, setCargando] = useState(true)
  const [alumnos, setAlumnos] = useState([])
  const [elegidos, setElegidos] = useState(() => new Set())
  const [busqueda, setBusqueda] = useState('')
  const [publicar, setPublicar] = useState(true)
  const [avance, setAvance] = useState(null) // { hechas, total }

  useEffect(() => {
    clientesDelEspacio('id, nombre, apellido')
      .eq('estado', 'activo')
      .order('nombre')
      .then(({ data }) => {
        setAlumnos((data || []).filter((alumno) => alumno.id !== sinCliente))
        setCargando(false)
      })
  }, [sinCliente])

  const visibles = useMemo(() => {
    const texto = normalizarTexto(busqueda.trim())
    if (!texto) return alumnos
    return alumnos.filter((alumno) =>
      normalizarTexto(`${alumno.nombre} ${alumno.apellido}`).includes(texto),
    )
  }, [alumnos, busqueda])

  const todosVisiblesElegidos =
    visibles.length > 0 && visibles.every((alumno) => elegidos.has(alumno.id))

  function alternar(id) {
    setElegidos((actual) => {
      const nuevo = new Set(actual)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  function alternarTodos() {
    setElegidos((actual) => {
      const nuevo = new Set(actual)
      for (const alumno of visibles) {
        if (todosVisiblesElegidos) nuevo.delete(alumno.id)
        else nuevo.add(alumno.id)
      }
      return nuevo
    })
  }

  async function copiar() {
    const ids = [...elegidos]
    setAvance({ hechas: 0, total: ids.length })
    const resultado = await copiarAVariosAlumnos(tipo, origen, ids, {
      publicar,
      hoy: obtenerFechaHoyISO(),
      alAvanzar: (hechas, total) => setAvance({ hechas, total }),
    })
    onListo(resultado)
  }

  const copiando = Boolean(avance)
  const cantidad = elegidos.size

  return (
    <div className="asistente-fondo" role="presentation">
      <div
        className="asistente-hoja"
        role="dialog"
        aria-modal="true"
        aria-label="Copiar a otros alumnos"
      >
        <div className="asistente-cabecera">
          <p className="asistente-titulo">Copiar a otros alumnos</p>
          <button
            type="button"
            className="asistente-cerrar"
            onClick={onCerrar}
            aria-label="Cerrar"
            disabled={copiando}
          >
            ✕
          </button>
        </div>
        <p className="profe-nota">
          Cada alumno elegido recibe su propia copia de “{origen.nombre}”. La original no cambia.
        </p>

        <input
          className="auth-input"
          type="search"
          placeholder="Buscar alumno…"
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          disabled={copiando}
        />

        {cargando ? (
          <Esqueleto filas={3} />
        ) : alumnos.length === 0 ? (
          <p className="profe-vacio">No hay otros alumnos activos.</p>
        ) : (
          <>
            <button
              type="button"
              className="boton-texto copiar-varios-todos"
              onClick={alternarTodos}
              disabled={copiando || visibles.length === 0}
            >
              {todosVisiblesElegidos ? 'Quitar todos' : `Elegir todos (${visibles.length})`}
            </button>
            <div className="copiar-varios-lista">
              {visibles.map((alumno) => (
                <label key={alumno.id} className="form-checkbox-row copiar-varios-alumno">
                  <input
                    type="checkbox"
                    checked={elegidos.has(alumno.id)}
                    onChange={() => alternar(alumno.id)}
                    disabled={copiando}
                  />
                  <span>
                    {alumno.nombre} {alumno.apellido}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          className="copiar-varios-publicar"
          role="switch"
          aria-checked={publicar}
          onClick={() => setPublicar(!publicar)}
          disabled={copiando}
        >
          <span className="descanso-aviso-fin-textos">
            <strong>Que ya la vean</strong>
            <small>
              {publicar
                ? 'Les aparece enseguida. Después elegís qué días la hace cada uno.'
                : 'Queda en borrador: la revisás en cada alumno antes de que la vean.'}
            </small>
          </span>
          <span
            className={publicar ? 'interruptor interruptor-on' : 'interruptor'}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          className="boton-principal"
          onClick={copiar}
          disabled={cantidad === 0 || copiando}
        >
          {copiando
            ? `Copiando ${avance.hechas} de ${avance.total}…`
            : cantidad === 0
              ? 'Elegí al menos un alumno'
              : `Copiar a ${cantidad} ${cantidad === 1 ? 'alumno' : 'alumnos'}`}
        </button>
      </div>
    </div>
  )
}

// "Copiada a 5 alumnos" (y si con alguno no se pudo, lo dice).
export function avisarCopia(copiadas, fallidas) {
  if (copiadas.length) {
    mostrarAviso(
      `Copiada a ${copiadas.length} ${copiadas.length === 1 ? 'alumno' : 'alumnos'}` +
        (fallidas.length ? ` · con ${fallidas.length} no se pudo` : ''),
      fallidas.length ? 'error' : 'ok',
    )
  } else {
    mostrarAviso('No pudimos copiar la rutina', 'error')
  }
}
