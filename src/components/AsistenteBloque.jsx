import { useEffect, useRef, useState } from 'react'
import {
  METODOS,
  obtenerMetodo,
  limitesDeEjercicios,
  nombreCortoDeMetodo,
} from '../data/metodos.js'
import {
  MAXIMO_NOTAS,
  MAXIMO_TEMPO,
  borradorAPrescripcion,
  borradorNuevo,
  ejercicioParaBorrador,
  nuevoPlanSemanal,
  validarBorrador,
} from '../utils/bloques.js'
import { nuevaSerieDeCalentamiento } from '../utils/seriesCalentamiento.js'
import { textoPrescripcion } from '../utils/semanas.js'
import { guardarUltimosValores, leerUltimosValores } from '../utils/ultimosValores.js'
import PasosAsistente from './PasosAsistente.jsx'
import SelectorEjercicios from './SelectorEjercicios.jsx'
import EditorRango from './EditorRango.jsx'
import InfoMetodo from './InfoMetodo.jsx'

const PASOS = ['Tipo', 'Ejercicios', 'Configurar']
const PASO_TIPO = 0
const PASO_EJERCICIOS = 1
const PASO_CONFIGURAR = 2

const METODOS_PRINCIPALES = METODOS.filter((metodo) => metodo.principal)
const OTROS_METODOS = METODOS.filter((metodo) => !metodo.principal)

// Asistente para agregar (o editar) un bloque de la rutina, en 3 pasos:
//   1. Tipo: ejercicio único, superserie, triserie, serie gigante,
//      circuito u otros métodos.
//   2. Ejercicios: se eligen de la biblioteca (primero los recomendados
//      para los grupos musculares de la rutina).
//   3. Configurar: series, repeticiones, peso objetivo, RPE, tempo, notas
//      para el alumno, cómo cambia en cada semana del ciclo (si la rutina
//      tiene ciclo), series de calentamiento (cada una con sus reps y kg,
//      y su propio descanso) y descanso de las series efectivas (rango).
//
// borradorInicial: null para un bloque nuevo, o el borrador de un bloque
// ya guardado (arranca directo en "Configurar", con "← Atrás" para
// cambiar el tipo o los ejercicios).
// semanasCiclo: semanas del ciclo de la rutina (0 = sin ciclo).
// calentamientoDe: posición del ejercicio cuyas series de calentamiento se
// quieren cargar ("+ Series de calentamiento" del editor). Abre directo
// ahí, con la primera serie ya propuesta si todavía no tenía.
// onGuardar(borrador) guarda y devuelve un texto de error, o '' si salió bien.
export default function AsistenteBloque({
  borradorInicial,
  grupos,
  biblioteca,
  mostrarKgObjetivo,
  semanasCiclo = 0,
  calentamientoDe = null,
  onGuardar,
  onCerrar,
}) {
  const editando = Boolean(borradorInicial)
  const [paso, setPaso] = useState(editando ? PASO_CONFIGURAR : PASO_TIPO)
  // Los últimos números que usó el profe, para proponerlos de entrada.
  const [ultimos] = useState(() => leerUltimosValores())
  const [borrador, setBorrador] = useState(() =>
    conCalentamientoActivo(
      borradorInicial || borradorNuevo('normal', ultimos.descanso),
      calentamientoDe,
    ),
  )
  const [mostrarOtros, setMostrarOtros] = useState(
    () => Boolean(borradorInicial) && !obtenerMetodo(borradorInicial.metodo).principal,
  )
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Mientras el asistente está abierto, la página de atrás no se mueve.
  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [])

  const metodo = obtenerMetodo(borrador.metodo)
  const { minimo, maximo } = limitesDeEjercicios(borrador.metodo)
  const cantidad = borrador.ejercicios.length
  const cantidadOk = cantidad >= minimo && (!maximo || cantidad <= maximo)

  function elegirTipo(metodoId) {
    const limites = limitesDeEjercicios(metodoId)
    setBorrador((actual) => ({
      ...actual,
      metodo: metodoId,
      config: metodoId === actual.metodo ? actual.config : {},
      ejercicios: limites.maximo ? actual.ejercicios.slice(0, limites.maximo) : actual.ejercicios,
    }))
    setError('')
    setPaso(PASO_EJERCICIOS)
  }

  function alternarEjercicio(ejercicio) {
    setBorrador((actual) => {
      const yaEsta = actual.ejercicios.some((item) => item.ejercicio.id === ejercicio.id)
      if (yaEsta) {
        return {
          ...actual,
          ejercicios: actual.ejercicios.filter((item) => item.ejercicio.id !== ejercicio.id),
        }
      }
      // En un ejercicio único, elegir otro reemplaza al anterior.
      if (maximo === 1)
        return { ...actual, ejercicios: [ejercicioParaBorrador(ejercicio, ultimos.ejercicio)] }
      return {
        ...actual,
        ejercicios: [...actual.ejercicios, ejercicioParaBorrador(ejercicio, ultimos.ejercicio)],
      }
    })
    setError('')
  }

  function moverEjercicio(indice, direccion) {
    setBorrador((actual) => {
      const lista = [...actual.ejercicios]
      const destino = indice + direccion
      if (destino < 0 || destino >= lista.length) return actual
      ;[lista[indice], lista[destino]] = [lista[destino], lista[indice]]
      return { ...actual, ejercicios: lista }
    })
  }

  function cambiarEjercicio(indice, campo, valor) {
    setBorrador((actual) => ({
      ...actual,
      ejercicios: actual.ejercicios.map((item, i) =>
        i === indice ? { ...item, [campo]: valor } : item,
      ),
    }))
  }

  function cambiarConfig(clave, valor) {
    setBorrador((actual) => ({ ...actual, config: { ...actual.config, [clave]: valor } }))
  }

  async function guardar() {
    const problema = validarBorrador(borrador)
    if (problema) {
      setError(problema)
      return
    }
    setGuardando(true)
    const resultado = await onGuardar(borrador)
    setGuardando(false)
    if (resultado) setError(resultado)
    else guardarUltimosValores(borrador)
  }

  const esGrupo = cantidad > 1
  const textoCantidad = maximo
    ? `${maximo} ${maximo === 1 ? 'ejercicio' : 'ejercicios'}`
    : `al menos ${minimo} ejercicios`

  return (
    <div className="asistente-fondo" role="presentation">
      <div
        className="asistente-hoja"
        role="dialog"
        aria-modal="true"
        aria-label={editando ? 'Editar bloque' : 'Agregar ejercicios'}
      >
        <div className="asistente-cabecera">
          <p className="asistente-titulo">{editando ? 'Editar bloque' : 'Agregar ejercicios'}</p>
          <button type="button" className="asistente-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <PasosAsistente pasos={PASOS} actual={paso} etiqueta="Pasos para agregar ejercicios" />

        {paso === PASO_TIPO && (
          <div className="asistente-paso">
            <p className="asistente-pregunta">¿Qué tipo de bloque querés agregar?</p>
            <p className="profe-nota">
              Define cuántos ejercicios se hacen juntos dentro de la misma serie de trabajo.
            </p>
            <div className="tipos-bloque">
              {METODOS_PRINCIPALES.map((opcion) => (
                <TarjetaTipo
                  key={opcion.id}
                  metodo={opcion}
                  activo={opcion.id === borrador.metodo}
                  onElegir={elegirTipo}
                />
              ))}
            </div>

            <button
              type="button"
              className="organizacion-toggle asistente-otros-toggle"
              onClick={() => setMostrarOtros((valor) => !valor)}
            >
              Otros métodos (1 ejercicio) {mostrarOtros ? '▲' : '▼'}
            </button>
            {mostrarOtros && (
              <div className="tipos-bloque">
                {OTROS_METODOS.map((opcion) => (
                  <TarjetaTipo
                    key={opcion.id}
                    metodo={opcion}
                    activo={opcion.id === borrador.metodo}
                    onElegir={elegirTipo}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {paso === PASO_EJERCICIOS && (
          <div className="asistente-paso">
            <p className="asistente-pregunta">
              {nombreCortoDeMetodo(borrador.metodo)}: elegí {textoCantidad}
            </p>

            {cantidad > 0 ? (
              <ol className="asistente-elegidos">
                {borrador.ejercicios.map((item, indice) => (
                  <li key={item.ejercicio.id} className="asistente-elegido">
                    <span className="asistente-elegido-nombre">
                      {indice + 1}. {item.ejercicio.nombre}
                    </span>
                    <span className="editor-ejercicio-acciones">
                      {cantidad > 1 && (
                        <>
                          <button
                            type="button"
                            className="editor-mover"
                            onClick={() => moverEjercicio(indice, -1)}
                            disabled={indice === 0}
                            aria-label={`Subir ${item.ejercicio.nombre}`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="editor-mover"
                            onClick={() => moverEjercicio(indice, 1)}
                            disabled={indice === cantidad - 1}
                            aria-label={`Bajar ${item.ejercicio.nombre}`}
                          >
                            ↓
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="editor-mover"
                        onClick={() => alternarEjercicio(item.ejercicio)}
                        aria-label={`Quitar ${item.ejercicio.nombre}`}
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="profe-vacio">Todavía no elegiste ningún ejercicio.</p>
            )}

            <SelectorEjercicios
              ejercicios={biblioteca}
              grupos={grupos}
              seleccionados={borrador.ejercicios.map((item) => item.ejercicio)}
              completo={Boolean(maximo) && maximo > 1 && cantidad >= maximo}
              onAlternar={alternarEjercicio}
            />
          </div>
        )}

        {paso === PASO_CONFIGURAR && (
          <div className="asistente-paso">
            <div className="asistente-pregunta asistente-pregunta-metodo">
              <span>Configurá {esGrupo ? 'cada ejercicio' : 'el ejercicio'}</span>
              <span className="asistente-metodo-chip">
                {nombreCortoDeMetodo(borrador.metodo)}
                <InfoMetodo metodoId={borrador.metodo} />
              </span>
            </div>

            {borrador.ejercicios.map((item, indice) => (
              <ConfigEjercicio
                key={item.ejercicio.id}
                item={item}
                numero={esGrupo ? indice + 1 : null}
                mostrarKgObjetivo={mostrarKgObjetivo}
                semanasCiclo={semanasCiclo}
                enfocarCalentamiento={indice === calentamientoDe}
                onCambiar={(campo, valor) => cambiarEjercicio(indice, campo, valor)}
              />
            ))}

            {metodo.campos.length > 0 && (
              <div className="config-bloque">
                <p className="config-bloque-titulo">
                  Datos de {nombreCortoDeMetodo(borrador.metodo)}
                </p>
                <div className="editor-campos">
                  {metodo.campos.map((campo) => (
                    <label key={campo.clave} className="editor-campo">
                      <span>{campo.etiqueta}</span>
                      <input
                        className="profe-input-tabla"
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={borrador.config?.[campo.clave] ?? ''}
                        onChange={(event) => cambiarConfig(campo.clave, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="config-bloque">
              <EditorRango
                etiqueta={
                  esGrupo ? 'Descanso al terminar el bloque' : 'Descanso entre series efectivas'
                }
                minimo={borrador.descansoMin}
                maximo={borrador.descansoMax}
                onCambiar={(min, max) =>
                  setBorrador((actual) => ({ ...actual, descansoMin: min, descansoMax: max }))
                }
              />
            </div>
          </div>
        )}

        {error && <p className="auth-message">{error}</p>}

        <div className="asistente-botones">
          {paso > PASO_TIPO ? (
            <button
              type="button"
              className="registro-boton-secundario"
              onClick={() => {
                setError('')
                setPaso(paso - 1)
              }}
            >
              ← Atrás
            </button>
          ) : (
            <span />
          )}
          {paso === PASO_EJERCICIOS && (
            <button
              type="button"
              className="pill-button asistente-siguiente"
              disabled={!cantidadOk}
              onClick={() => setPaso(PASO_CONFIGURAR)}
            >
              Siguiente
            </button>
          )}
          {paso === PASO_CONFIGURAR && (
            <button
              type="button"
              className="pill-button asistente-siguiente"
              disabled={guardando}
              onClick={guardar}
            >
              {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : '+ Agregar a la rutina'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TarjetaTipo({ metodo, activo, onElegir }) {
  return (
    <div className={activo ? 'tipo-bloque tipo-bloque-activo' : 'tipo-bloque'}>
      <button type="button" className="tipo-bloque-boton" onClick={() => onElegir(metodo.id)}>
        <span className="tipo-bloque-nombre">{nombreCortoDeMetodo(metodo.id)}</span>
        <span className="tipo-bloque-resumen">{metodo.resumen}</span>
      </button>
      <InfoMetodo metodoId={metodo.id} />
    </div>
  )
}

// Casilleros de un ejercicio del bloque: series, repeticiones (una
// cantidad o un rango), peso objetivo, RPE, tempo, semanas del ciclo,
// series de calentamiento y notas para el alumno.
function ConfigEjercicio({
  item,
  numero,
  mostrarKgObjetivo,
  semanasCiclo,
  enfocarCalentamiento,
  onCambiar,
}) {
  return (
    <div className="config-ejercicio">
      <div className="ejercicio-header config-ejercicio-nombre">
        <span>
          {numero ? `${numero}. ` : ''}
          {item.ejercicio.nombre}
        </span>
      </div>

      <div className="editor-campos config-ejercicio-campos">
        <label className="editor-campo">
          <span>Series</span>
          <input
            className="profe-input-tabla"
            type="number"
            min="1"
            inputMode="numeric"
            value={item.series}
            onChange={(event) => onCambiar('series', event.target.value)}
          />
        </label>
        <div className="editor-campo">
          <span>Repeticiones</span>
          <div className="config-reps">
            <input
              className="profe-input-tabla"
              type="number"
              min="1"
              inputMode="numeric"
              aria-label="Repeticiones (desde)"
              value={item.repsDesde}
              onChange={(event) => onCambiar('repsDesde', event.target.value)}
            />
            <span>a</span>
            <input
              className="profe-input-tabla"
              type="number"
              min="1"
              inputMode="numeric"
              placeholder="—"
              aria-label="Repeticiones (hasta, opcional)"
              value={item.repsHasta}
              onChange={(event) => onCambiar('repsHasta', event.target.value)}
            />
          </div>
        </div>
        {mostrarKgObjetivo && (
          <label className="editor-campo">
            <span>Peso objetivo (kg)</span>
            <input
              className="profe-input-tabla config-input-ancho"
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={item.kg}
              onChange={(event) => onCambiar('kg', event.target.value)}
            />
          </label>
        )}
        <label className="editor-campo">
          <span>RPE (opcional)</span>
          <input
            className="profe-input-tabla"
            type="text"
            placeholder="8"
            value={item.rpe}
            onChange={(event) => onCambiar('rpe', event.target.value)}
          />
        </label>
        <label className="editor-campo">
          <span>Tempo (opcional)</span>
          <input
            className="profe-input-tabla config-input-ancho"
            type="text"
            placeholder="3-1-1-0"
            maxLength={MAXIMO_TEMPO}
            value={item.tempo ?? ''}
            onChange={(event) => onCambiar('tempo', event.target.value)}
          />
        </label>
      </div>

      {semanasCiclo > 1 && (
        <ConfigSemanas
          item={item}
          semanasCiclo={semanasCiclo}
          mostrarKg={mostrarKgObjetivo}
          onCambiar={onCambiar}
        />
      )}

      <ConfigCalentamiento item={item} enfocar={enfocarCalentamiento} onCambiar={onCambiar} />

      <label className="editor-campo config-notas">
        <span>Notas para el alumno (opcional)</span>
        <textarea
          className="form-textarea"
          placeholder="Ej: bajá lento, codos cerca del cuerpo"
          maxLength={MAXIMO_NOTAS}
          value={item.notas ?? ''}
          onChange={(event) => onCambiar('notas', event.target.value)}
        />
      </label>
    </div>
  )
}

// Cómo cambia el ejercicio en cada semana del ciclo:
//   · "Sube cada semana": cuántos kg o reps se suben por semana (o nada:
//     todas las semanas iguales).
//   · "Cada semana distinta": una fila por semana con series, reps y peso
//     (la semana 1 es la de arriba). Es lo mismo que las columnas SEMANA
//     de la planilla de Excel.
function ConfigSemanas({ item, semanasCiclo, mostrarKg, onCambiar }) {
  const distinta = Boolean(item.semanasPlan)
  const semanas = item.semanasPlan || []

  function elegirDistinta(activa) {
    if (activa === distinta) return
    if (activa) {
      onCambiar('semanasPlan', nuevoPlanSemanal(item, semanasCiclo))
      onCambiar('progresionKg', '')
      onCambiar('progresionReps', '')
    } else {
      onCambiar('semanasPlan', null)
    }
  }

  function cambiarSemana(indice, campo, valor) {
    onCambiar(
      'semanasPlan',
      semanas.map((semana, i) => (i === indice ? { ...semana, [campo]: valor } : semana)),
    )
  }

  return (
    <div className="config-progresion">
      <span className="editor-rango-etiqueta">Semanas del ciclo ({semanasCiclo})</span>
      <div className="chips-lista">
        <button
          type="button"
          className={distinta ? 'chip' : 'chip chip-activo'}
          onClick={() => elegirDistinta(false)}
          aria-pressed={!distinta}
        >
          Igual o sube lo mismo
        </button>
        <button
          type="button"
          className={distinta ? 'chip chip-activo' : 'chip'}
          onClick={() => elegirDistinta(true)}
          aria-pressed={distinta}
        >
          Cada semana distinta
        </button>
      </div>

      {distinta ? (
        <div className="config-semanas">
          <p className="config-semanas-fila config-semanas-primera">
            <span className="config-semanas-numero">S1</span>
            <span>{textoPrescripcion(borradorAPrescripcion(item))} (lo de arriba)</span>
          </p>
          {semanas.map((semana, indice) => {
            const nombre = `Semana ${indice + 2}`
            return (
              <div key={indice} className="config-semanas-fila">
                <span className="config-semanas-numero">S{indice + 2}</span>
                <label className="editor-campo">
                  <span>Series</span>
                  <input
                    className="profe-input-tabla"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    aria-label={`${nombre}: series`}
                    value={semana.series}
                    onChange={(event) => cambiarSemana(indice, 'series', event.target.value)}
                  />
                </label>
                <div className="editor-campo">
                  <span>Reps</span>
                  <div className="config-reps">
                    <input
                      className="profe-input-tabla"
                      type="number"
                      min="1"
                      inputMode="numeric"
                      aria-label={`${nombre}: repeticiones (desde)`}
                      value={semana.repsDesde}
                      onChange={(event) => cambiarSemana(indice, 'repsDesde', event.target.value)}
                    />
                    <span>a</span>
                    <input
                      className="profe-input-tabla"
                      type="number"
                      min="1"
                      inputMode="numeric"
                      placeholder="—"
                      aria-label={`${nombre}: repeticiones (hasta, opcional)`}
                      value={semana.repsHasta}
                      onChange={(event) => cambiarSemana(indice, 'repsHasta', event.target.value)}
                    />
                  </div>
                </div>
                {mostrarKg && (
                  <label className="editor-campo">
                    <span>Kg</span>
                    <input
                      className="profe-input-tabla config-input-ancho"
                      type="number"
                      min="0"
                      step="0.5"
                      inputMode="decimal"
                      placeholder="—"
                      aria-label={`${nombre}: peso (kg)`}
                      value={semana.kg}
                      onChange={(event) => cambiarSemana(indice, 'kg', event.target.value)}
                    />
                  </label>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <p className="profe-nota">
            Sube por semana (opcional). Vacío: todas las semanas iguales.
          </p>
          <div className="editor-campos">
            {mostrarKg && (
              <label className="editor-campo">
                <span>+ kg</span>
                <input
                  className="profe-input-tabla"
                  type="number"
                  min="0"
                  step="0.5"
                  inputMode="decimal"
                  placeholder="2,5"
                  value={item.progresionKg}
                  onChange={(event) => onCambiar('progresionKg', event.target.value)}
                />
              </label>
            )}
            <label className="editor-campo">
              <span>+ reps</span>
              <input
                className="profe-input-tabla"
                type="number"
                min="0"
                inputMode="numeric"
                placeholder="0"
                value={item.progresionReps}
                onChange={(event) => onCambiar('progresionReps', event.target.value)}
              />
            </label>
          </div>
        </>
      )}
    </div>
  )
}

// Series de calentamiento (aproximación) de un ejercicio: una fila por
// serie, con sus repeticiones y su peso, y el descanso de calentamiento
// (aparte del descanso de las series efectivas). El alumno las hace
// antes de las efectivas, en amarillo. El peso se pide siempre (también
// en el Plan rutina, donde no hay peso objetivo): cada serie de
// calentamiento puede tener un peso distinto.
// enfocar: se llegó desde "+ Series de calentamiento" del editor; la
// pantalla baja sola hasta acá y lo resalta un momento.
function ConfigCalentamiento({ item, enfocar, onCambiar }) {
  const series = item.calentamientoSeries || []
  const referencia = useRef(null)

  useEffect(() => {
    if (enfocar) referencia.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [enfocar])

  function activar(activo) {
    onCambiar('calentamiento', activo)
    if (activo && !series.length) {
      onCambiar('calentamientoSeries', [nuevaSerieDeCalentamiento([], item.kg)])
    }
  }

  function cambiarSerie(indice, campo, valor) {
    onCambiar(
      'calentamientoSeries',
      series.map((serie, i) => (i === indice ? { ...serie, [campo]: valor } : serie)),
    )
  }

  function agregarSerie() {
    onCambiar('calentamientoSeries', [...series, nuevaSerieDeCalentamiento(series, item.kg)])
  }

  function quitarSerie(indice) {
    const quedan = series.filter((_, i) => i !== indice)
    onCambiar('calentamientoSeries', quedan)
    if (!quedan.length) onCambiar('calentamiento', false)
  }

  return (
    <div
      ref={referencia}
      className={
        enfocar ? 'config-calentamiento config-calentamiento-enfocado' : 'config-calentamiento'
      }
    >
      <span className="editor-rango-etiqueta">Series de calentamiento (aproximación)</span>
      <span className="config-calentamiento-ayuda">
        Series más livianas de este mismo ejercicio, antes de las efectivas. Cada una con sus
        repeticiones y su peso.
      </span>
      <div className="chips-lista">
        <button
          type="button"
          className={item.calentamiento ? 'chip' : 'chip chip-activo'}
          onClick={() => activar(false)}
          aria-pressed={!item.calentamiento}
        >
          No
        </button>
        <button
          type="button"
          className={item.calentamiento ? 'chip chip-activo' : 'chip'}
          onClick={() => activar(true)}
          aria-pressed={item.calentamiento}
        >
          Sí
        </button>
      </div>

      {item.calentamiento && (
        <div className="config-calentamiento-series">
          {item.calentamientoNota && (
            <p className="config-calentamiento-nota">
              Antes decía: “{item.calentamientoNota}”. Pasalo a series (repeticiones y peso).
            </p>
          )}
          {series.map((serie, indice) => (
            <div key={indice} className="config-calentamiento-fila">
              <span className="config-calentamiento-numero">{indice + 1}.</span>
              <label className="editor-campo">
                <span>Reps</span>
                <input
                  className="profe-input-tabla"
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={serie.reps}
                  onChange={(event) => cambiarSerie(indice, 'reps', event.target.value)}
                />
              </label>
              <label className="editor-campo">
                <span>Peso (kg)</span>
                <input
                  className="profe-input-tabla config-input-ancho"
                  type="number"
                  min="0"
                  step="0.5"
                  inputMode="decimal"
                  placeholder="—"
                  value={serie.kg}
                  onChange={(event) => cambiarSerie(indice, 'kg', event.target.value)}
                />
              </label>
              <button
                type="button"
                className="profe-ejercicio-borrar"
                onClick={() => quitarSerie(indice)}
                aria-label={`Quitar la serie de calentamiento ${indice + 1}`}
              >
                Quitar
              </button>
            </div>
          ))}
          <button type="button" className="profe-ejercicio-agregar" onClick={agregarSerie}>
            + Agregar serie de calentamiento
          </button>
          <label className="editor-campo">
            <span>Descanso de calentamiento (segundos)</span>
            <input
              className="profe-input-tabla"
              type="number"
              min="0"
              step="5"
              inputMode="numeric"
              value={item.calentamientoDescanso}
              onChange={(event) => onCambiar('calentamientoDescanso', event.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  )
}

// Borrador con las series de calentamiento del ejercicio "posicion" ya
// activadas (con una primera serie propuesta), para cuando el profe toca
// "+ Series de calentamiento". Sin posición, el borrador queda igual.
function conCalentamientoActivo(borrador, posicion) {
  const item = posicion == null ? null : borrador.ejercicios[posicion]
  if (!item || (item.calentamiento && item.calentamientoSeries?.length)) return borrador
  return {
    ...borrador,
    ejercicios: borrador.ejercicios.map((actual, indice) =>
      indice === posicion
        ? {
            ...actual,
            calentamiento: true,
            calentamientoSeries: [nuevaSerieDeCalentamiento([], actual.kg)],
          }
        : actual,
    ),
  }
}
