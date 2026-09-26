import { useEffect, useState } from 'react'
import {
  METODOS,
  obtenerMetodo,
  limitesDeEjercicios,
  nombreCortoDeMetodo,
} from '../data/metodos.js'
import { borradorNuevo, ejercicioParaBorrador, validarBorrador } from '../utils/bloques.js'
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
//   3. Configurar: series, repeticiones, calentamiento, peso objetivo y
//      descanso (como rango).
//
// borradorInicial: null para un bloque nuevo, o el borrador de un bloque
// ya guardado (arranca directo en "Configurar", con "← Atrás" para
// cambiar el tipo o los ejercicios).
// onGuardar(borrador) guarda y devuelve un texto de error, o '' si salió bien.
export default function AsistenteBloque({
  borradorInicial,
  grupos,
  biblioteca,
  mostrarKgObjetivo,
  conCiclo = false,
  onGuardar,
  onCerrar,
}) {
  const editando = Boolean(borradorInicial)
  const [paso, setPaso] = useState(editando ? PASO_CONFIGURAR : PASO_TIPO)
  // Los últimos números que usó el profe, para proponerlos de entrada.
  const [ultimos] = useState(() => leerUltimosValores())
  const [borrador, setBorrador] = useState(
    () => borradorInicial || borradorNuevo('normal', ultimos.descanso),
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
                conCiclo={conCiclo}
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
                etiqueta={esGrupo ? 'Descanso al terminar el bloque' : 'Descanso entre series'}
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
// cantidad o un rango), peso objetivo, RPE y calentamiento.
function ConfigEjercicio({ item, numero, mostrarKgObjetivo, conCiclo, onCambiar }) {
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
      </div>

      {conCiclo && (
        <div className="config-progresion">
          <span className="editor-rango-etiqueta">Sube por semana (ciclo, opcional)</span>
          <div className="editor-campos">
            {mostrarKgObjetivo && (
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
        </div>
      )}

      <div className="config-calentamiento">
        <span className="editor-rango-etiqueta">Series de calentamiento</span>
        <div className="chips-lista">
          <button
            type="button"
            className={item.calentamiento ? 'chip' : 'chip chip-activo'}
            onClick={() => onCambiar('calentamiento', false)}
            aria-pressed={!item.calentamiento}
          >
            No
          </button>
          <button
            type="button"
            className={item.calentamiento ? 'chip chip-activo' : 'chip'}
            onClick={() => onCambiar('calentamiento', true)}
            aria-pressed={item.calentamiento}
          >
            Sí
          </button>
        </div>
        {item.calentamiento && (
          <div className="editor-campos">
            <label className="editor-campo">
              <span>Cantidad</span>
              <input
                className="profe-input-tabla"
                type="number"
                min="1"
                inputMode="numeric"
                value={item.calentamientoSeries}
                onChange={(event) => onCambiar('calentamientoSeries', event.target.value)}
              />
            </label>
            <label className="editor-campo editor-campo-ancho">
              <span>Detalle (opcional)</span>
              <input
                className="profe-input-tabla config-input-detalle"
                type="text"
                placeholder="Ej: 1 × 12 con 40 kg, 1 × 8 con 60 kg"
                value={item.calentamientoDetalle}
                onChange={(event) => onCambiar('calentamientoDetalle', event.target.value)}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
