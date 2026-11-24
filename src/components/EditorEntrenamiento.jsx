import { useState } from 'react'
import CasilleroNumero from './entrenar/CasilleroNumero.jsx'
import MarcaFallo from './entrenar/MarcaFallo.jsx'
import {
  borrarEntrenamiento,
  corregirEntrenamiento,
  textoDeErrorAlBorrar,
  textoDeErrorAlCorregir,
} from '../services/entrenamientos.js'
import {
  MAXIMO_SERIES_POR_EJERCICIO,
  agregarSerie,
  corregirDetalle,
  marcarEjercicioHecho,
  marcarSerieHecha,
  mismoDetalle,
  quitarSerie,
  seriesGuardadas,
} from '../utils/entrenamientoHecho.js'
import { formatearPeso } from '../utils/progreso.js'
import { esPorTiempo, nombreDeUnidad, unidadDe } from '../utils/porTiempo.js'
import { textoDeEsfuerzo } from '../data/esfuerzo.js'
import { useConfirmar } from './ConfirmarAccion.jsx'

// Ventana para ver y corregir un entrenamiento YA GUARDADO: el peso, las
// repeticiones y si llegó al fallo en cada serie, por si quedó algo mal
// anotado. La usan el
// alumno (Progreso → "Tus entrenamientos") y el profe o el Admin (ficha
// del alumno → Progreso → "Últimos entrenamientos"): es la misma.
//
// Se toca un número, se escribe el correcto y "Guardar corrección". El
// botón "Fallo" de cada serie efectiva se prende y se apaga. Si se olvidó
// de marcar algo (terminó un ejercicio con la app ya cerrada): "✓ Hecha"
// en cada serie que no hizo (o "Marcar todo hecho" en el ejercicio) y se
// corrigen el peso y las repeticiones; "+ Agregar serie" suma una que no
// estaba. Lo marcado o agregado recién se puede deshacer antes de
// guardar. Con la corrección cambian solos los récords, las gráficas y
// "La vez pasada".
//
// Arriba se ve cómo se sintió (el grado de exigencia) y lo que le
// escribió al profe al guardar: lo ven los dos, el alumno y el profe.
// En los ejercicios por tiempo los números son segundos
// (utils/porTiempo.js).
//
// Abajo, "Borrar este entrenamiento": para el que se guardó sin querer
// (pide confirmación; no se puede deshacer).
//
//   sesion: el entrenamiento ({ id, detalle, esfuerzo, comentario }).
//   clienteId: de quién es.
//   titulo: lo que se muestra arriba ("Piernas · 5/10").
//   onGuardado(cambios): se llama con { id, detalle, editado_en } cuando
//     se guardó. onCerrar: cierra sin guardar.
//   onBorrado(id): se borró el entrenamiento (si no se pasa, no se
//     ofrece borrar).
export default function EditorEntrenamiento({
  sesion,
  clienteId,
  titulo,
  onCerrar,
  onGuardado,
  onBorrado,
}) {
  const original = Array.isArray(sesion.detalle) ? sesion.detalle : []
  const [detalle, setDetalle] = useState(original)
  const [guardando, setGuardando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState('')
  const [confirmar, hojaConfirmar] = useConfirmar()
  const hayCambios = !mismoDetalle(original, detalle)
  const esfuerzo = textoDeEsfuerzo(sesion.esfuerzo)

  async function borrar() {
    if (borrando || guardando) return
    const seguro = await confirmar({
      titulo: '¿Borrar este entrenamiento?',
      texto: 'Se borra con todas sus series y no se puede deshacer.',
      confirmar: 'Sí, borrar',
      cancelar: 'No, dejarlo',
    })
    if (!seguro) return
    setBorrando(true)
    setError('')
    const resultado = await borrarEntrenamiento({ id: sesion.id, clienteId })
    setBorrando(false)
    if (resultado.error) {
      setError(textoDeErrorAlBorrar(resultado.error))
      return
    }
    onBorrado(sesion.id)
  }

  function cambiar(transformar) {
    setError('')
    setDetalle(transformar)
  }

  function corregir(ejercicioIndex, serie, campo, valor) {
    cambiar((actual) =>
      corregirDetalle(actual, ejercicioIndex, serie.lista, serie.indice, campo, valor),
    )
  }

  async function guardar() {
    if (!hayCambios || guardando) return
    setGuardando(true)
    setError('')
    const resultado = await corregirEntrenamiento({ id: sesion.id, clienteId, detalle })
    setGuardando(false)
    if (resultado.error) {
      setError(textoDeErrorAlCorregir(resultado.error))
      return
    }
    onGuardado(resultado.sesion)
  }

  return (
    <div className="asistente-fondo" role="presentation">
      <div
        className="asistente-hoja corregir-hoja"
        role="dialog"
        aria-modal="true"
        aria-label="Corregir entrenamiento"
      >
        <div className="asistente-cabecera">
          <p className="asistente-titulo">Corregir entrenamiento</p>
          <button type="button" className="asistente-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {titulo && <p className="corregir-subtitulo">{titulo}</p>}

        {(esfuerzo || sesion.comentario) && (
          <div className="corregir-sensacion">
            {esfuerzo && <strong>{esfuerzo}</strong>}
            {sesion.comentario && <p>“{sesion.comentario}”</p>}
          </div>
        )}

        {original.length === 0 ? (
          <p className="profe-nota">Este entrenamiento no tiene series anotadas.</p>
        ) : (
          <>
            <p className="profe-nota">
              Tocá el número que quedó mal, escribí el correcto y guardá. Se corrigen el peso, las
              repeticiones y si llegó al fallo (botón &quot;Fallo&quot;). ¿Te olvidaste de marcar
              un ejercicio? Tocá &quot;✓ Hecha&quot; en cada serie (o &quot;Marcar todo
              hecho&quot;), poné el peso y las repeticiones, y guardá.
            </p>
            {detalle.map((item, ejercicioIndex) => (
              <EjercicioGuardado
                key={ejercicioIndex}
                item={item}
                original={original[ejercicioIndex]}
                onCorregir={(serie, campo, valor) => corregir(ejercicioIndex, serie, campo, valor)}
                onMarcar={(serie, hecha) =>
                  cambiar((actual) =>
                    marcarSerieHecha(actual, ejercicioIndex, serie.lista, serie.indice, hecha),
                  )
                }
                onMarcarTodo={() => cambiar((actual) => marcarEjercicioHecho(actual, ejercicioIndex))}
                onAgregar={() => cambiar((actual) => agregarSerie(actual, ejercicioIndex))}
                onQuitar={(serie) =>
                  cambiar((actual) => quitarSerie(actual, ejercicioIndex, serie.indice))
                }
              />
            ))}
          </>
        )}

        {error && (
          <p className="auth-message" role="alert">
            {error}
          </p>
        )}

        <div className="corregir-acciones">
          <button
            type="button"
            className="boton-principal"
            onClick={guardar}
            disabled={!hayCambios || guardando}
          >
            {guardando ? 'Guardando…' : 'Guardar corrección'}
          </button>
          <button type="button" className="boton-secundario" onClick={onCerrar}>
            {hayCambios ? 'Cancelar' : 'Cerrar'}
          </button>
        </div>

        {onBorrado && (
          <div className="corregir-borrar">
            <p className="profe-nota">
              ¿Se guardó sin querer (por ejemplo, abriste la rutina solo para mirarla)? Podés
              borrarlo: deja de contar en los récords y las gráficas.
            </p>
            <button
              type="button"
              className="boton-peligro"
              onClick={borrar}
              disabled={borrando || guardando}
            >
              {borrando ? 'Borrando…' : 'Borrar este entrenamiento'}
            </button>
          </div>
        )}
      </div>
      {hojaConfirmar}
    </div>
  )
}

// Un ejercicio del entrenamiento con sus series: las de calentamiento
// (en amarillo) y las efectivas, cada una con su peso y sus repeticiones
// para corregir y, las efectivas, el botón "Fallo". Las que no hizo
// tienen "✓ Hecha"; lo marcado o agregado recién (comparando con
// "original", lo guardado) se puede deshacer.
function EjercicioGuardado({
  item,
  original,
  onCorregir,
  onMarcar,
  onMarcarTodo,
  onAgregar,
  onQuitar,
}) {
  const series = seriesGuardadas(item)
  const antes = seriesGuardadas(original)
  const deAntes = (serie) =>
    antes.find((otra) => otra.lista === serie.lista && otra.indice === serie.indice) || null
  const sinHacer = series.filter((serie) => !serie.hecha).length
  const efectivas = series.filter((serie) => serie.lista === 'series').length
  const nombre = item.nombre || 'Ejercicio'
  // "reps" o "seg" (ejercicio por tiempo).
  const unidad = unidadDe(item)

  return (
    <section className="corregir-ejercicio">
      <div className="corregir-ejercicio-cabecera">
        <h3 className="corregir-ejercicio-nombre">
          {nombre}
          {esPorTiempo(item) && <small className="corregir-por-tiempo">⏱ por tiempo</small>}
        </h3>
        {sinHacer > 1 && (
          <button type="button" className="corregir-marcar-todo" onClick={onMarcarTodo}>
            ✓ Marcar todo hecho
          </button>
        )}
      </div>
      {series.length === 0 ? (
        <p className="corregir-serie-sin-hacer">Sin series anotadas</p>
      ) : (
        <ul className="corregir-series">
          {series.map((serie) => {
            const anterior = deAntes(serie)
            // Agregada recién (no estaba) o marcada recién (no la había hecho).
            const agregada = !anterior
            const marcadaRecien = Boolean(anterior) && !anterior.hecha && serie.hecha
            return (
              <li
                key={`${serie.lista}-${serie.indice}`}
                className={claseDeSerie(serie, agregada || marcadaRecien)}
                aria-label={serie.texto}
              >
                <span className="corregir-serie-nombre">
                  {serie.texto}
                  {agregada && (
                    <button
                      type="button"
                      className="corregir-deshacer"
                      onClick={() => onQuitar(serie)}
                      aria-label={`Quitar ${serie.texto}`}
                    >
                      Quitar
                    </button>
                  )}
                  {marcadaRecien && (
                    <button
                      type="button"
                      className="corregir-deshacer"
                      onClick={() => onMarcar(serie, false)}
                      aria-label={`${serie.texto}: deshacer, no la hizo`}
                    >
                      Deshacer
                    </button>
                  )}
                </span>
                {serie.hecha && !serie.calentamiento && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={serie.fallo}
                    aria-label={`${serie.texto}: llegó al fallo`}
                    className={
                      serie.fallo ? 'corregir-fallo corregir-fallo-activo' : 'corregir-fallo'
                    }
                    onClick={() => onCorregir(serie, 'fallo', !serie.fallo)}
                  >
                    {serie.fallo ? <MarcaFallo /> : 'Fallo'}
                  </button>
                )}
                {serie.hecha ? (
                  <span className="corregir-serie-valores">
                    <label>
                      <CasilleroNumero
                        className="corregir-casillero"
                        enVivo
                        valor={formatearPeso(serie.kg)}
                        campo="kg"
                        etiqueta={`${serie.texto}, kilos`}
                        onFijar={(valor) => onCorregir(serie, 'kg', valor)}
                      />
                      <small>kg</small>
                    </label>
                    <span aria-hidden="true">×</span>
                    <label>
                      <CasilleroNumero
                        className="corregir-casillero"
                        enVivo
                        valor={serie.reps}
                        campo="reps"
                        etiqueta={`${serie.texto}, ${nombreDeUnidad(item)}`}
                        onFijar={(valor) => onCorregir(serie, 'reps', valor)}
                      />
                      <small>{unidad}</small>
                    </label>
                  </span>
                ) : (
                  <span className="corregir-serie-pendiente-acciones">
                    <span className="corregir-serie-sin-hacer">No la hizo</span>
                    <button
                      type="button"
                      className="corregir-la-hice"
                      onClick={() => onMarcar(serie, true)}
                      aria-label={`${serie.texto}: marcar como hecha`}
                    >
                      ✓ Hecha
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {efectivas < MAXIMO_SERIES_POR_EJERCICIO && (
        <button
          type="button"
          className="corregir-agregar-serie"
          onClick={onAgregar}
          aria-label={`Agregar una serie a ${nombre}`}
        >
          + Agregar serie
        </button>
      )}
    </section>
  )
}

function claseDeSerie(serie, cambiadaRecien) {
  let clase = 'corregir-serie'
  if (serie.calentamiento) clase += ' corregir-serie-calentamiento'
  if (!serie.hecha) clase += ' corregir-serie-pendiente'
  if (cambiadaRecien) clase += ' corregir-serie-nueva'
  return clase
}
