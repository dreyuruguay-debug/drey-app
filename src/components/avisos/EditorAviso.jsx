import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import HojaInferior from '../HojaInferior.jsx'
import { mostrarAviso } from '../../services/avisos.js'
import {
  guardarTipoDeAviso,
  mensajeDeError,
  probarTipoDeAviso,
} from '../../services/avisosAdmin.js'
import { DESTINOS } from '../../data/avisos.js'
import { ejemplosDe, rellenarAviso } from '../../utils/textoAviso.js'

// Editor de una notificación (Ajustes → Notificaciones → tocar una).
// Sube desde abajo (en la compu, centrado) con todo lo que se puede
// cambiar, en este orden:
//   1. Prendida o apagada.
//   2. Cuándo: la hora (programadas) y los días (las de "sin entrenar").
//      Los plazos de vencimiento se cambian en Ajustes → Plazos.
//   3. A quién: planes (alumnos) o profe / Admin (profes).
//   4. Textos: título y texto, con los datos que se pueden usar ({nombre},
//      {rutina}…) y "Volver al texto original".
//   5. Vista previa con datos de ejemplo, "Enviarme una prueba" y Guardar.
//
//   tipo:   la notificación (services/avisosAdmin.js).
//   extras: { diasAviso, diasGracia, planes }.
//   onGuardado(tipo): ya se guardó en la base.
export default function EditorAviso({ tipo, extras, onCerrar, onGuardado }) {
  const [formulario, setFormulario] = useState(tipo)
  const [guardando, setGuardando] = useState(false)
  const [probando, setProbando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  // Último campo de texto tocado, para insertar ahí los {datos}.
  const ultimoCampo = useRef('cuerpo')
  const campos = { titulo: useRef(null), cuerpo: useRef(null) }

  const cambiado = JSON.stringify(formulario) !== JSON.stringify(tipo)
  const ejemplos = ejemplosDe(formulario.variables)
  const textoOriginal =
    formulario.titulo === formulario.tituloOriginal &&
    formulario.cuerpo === formulario.cuerpoOriginal

  function cambiar(campo, valor) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }))
    setMensaje('')
  }

  // Inserta "{dato}" donde estaba el cursor en el último campo tocado.
  function insertarDato(clave) {
    const campo = ultimoCampo.current
    const elemento = campos[campo].current
    const texto = formulario[campo]
    const inicio = elemento?.selectionStart ?? texto.length
    const fin = elemento?.selectionEnd ?? texto.length
    // Con un espacio antes si quedaría pegado a la palabra anterior.
    const espacio = inicio > 0 && !/\s/.test(texto[inicio - 1]) ? ' ' : ''
    const dato = `${espacio}{${clave}}`
    const nuevo = `${texto.slice(0, inicio)}${dato}${texto.slice(fin)}`
    cambiar(campo, nuevo)
    requestAnimationFrame(() => {
      const posicion = inicio + dato.length
      elemento?.focus()
      elemento?.setSelectionRange(posicion, posicion)
    })
  }

  function alternarPlan(id) {
    const planes = formulario.planes.includes(id)
      ? formulario.planes.filter((plan) => plan !== id)
      : [...formulario.planes, id]
    cambiar('planes', planes)
  }

  async function guardar(event) {
    event.preventDefault()
    if (!formulario.titulo.trim()) {
      setMensaje('El título no puede quedar vacío.')
      return
    }
    setGuardando(true)
    const error = await guardarTipoDeAviso(formulario)
    setGuardando(false)
    if (error) {
      setMensaje(mensajeDeError(error))
      return
    }
    mostrarAviso('Notificación guardada')
    onGuardado(formulario)
  }

  async function probar() {
    setProbando(true)
    const { celulares, error } = await probarTipoDeAviso(formulario)
    setProbando(false)
    if (error) {
      mostrarAviso(mensajeDeError(error), 'error')
      return
    }
    mostrarAviso(
      celulares > 0
        ? 'Prueba enviada: te llega en unos segundos'
        : 'Activá las notificaciones en tu celular (Mi cuenta) para recibir la prueba',
      celulares > 0 ? undefined : 'error',
    )
  }

  return (
    <HojaInferior abierta onCerrar={onCerrar} titulo={tipo.nombre} id="editor-aviso">
      <form className="aviso-editor" onSubmit={guardar}>
        <p className="aviso-editor-descripcion">{tipo.descripcion}</p>
        {tipo.nota && <p className="aviso-editor-nota">{tipo.nota}</p>}

        <button
          type="button"
          className="tarjeta-rutina notificaciones-tarjeta"
          role="switch"
          aria-checked={formulario.activo}
          onClick={() => cambiar('activo', !formulario.activo)}
        >
          <span className="tarjeta-rutina-textos">
            <strong>{formulario.activo ? 'Prendida' : 'Apagada'}</strong>
            <small>
              {formulario.activo ? 'Se manda cuando corresponde.' : 'No se manda a nadie.'}
            </small>
          </span>
          <span
            className={formulario.activo ? 'interruptor interruptor-on' : 'interruptor'}
            aria-hidden="true"
          />
        </button>

        <Cuando formulario={formulario} extras={extras} onCambiar={cambiar} />

        <fieldset className="aviso-editor-grupo">
          <legend>A quién le llega</legend>
          {formulario.grupo === 'profe' ? (
            <select
              className="profe-calendario-select"
              value={formulario.destino || ''}
              onChange={(event) => cambiar('destino', event.target.value)}
            >
              {formulario.destinosPosibles.map((destino) => (
                <option key={destino} value={destino}>
                  {DESTINOS[destino] || destino}
                </option>
              ))}
            </select>
          ) : (
            <>
              <div className="chips-lista">
                <button
                  type="button"
                  className={formulario.planes.length === 0 ? 'chip chip-activo' : 'chip'}
                  onClick={() => cambiar('planes', [])}
                >
                  Todos los planes
                </button>
                {extras.planes.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    className={formulario.planes.includes(plan.id) ? 'chip chip-activo' : 'chip'}
                    onClick={() => alternarPlan(plan.id)}
                  >
                    {plan.nombre}
                  </button>
                ))}
              </div>
              <small className="aviso-editor-ayuda">
                Siempre solo a quienes activaron las notificaciones en su celular.
              </small>
            </>
          )}
        </fieldset>

        <fieldset className="aviso-editor-grupo">
          <legend>Texto</legend>
          <label className="ajustes-campo">
            <span>Título</span>
            <input
              ref={campos.titulo}
              className="auth-input"
              maxLength={80}
              value={formulario.titulo}
              onFocus={() => (ultimoCampo.current = 'titulo')}
              onChange={(event) => cambiar('titulo', event.target.value)}
            />
          </label>
          <label className="ajustes-campo">
            <span>Texto</span>
            <textarea
              ref={campos.cuerpo}
              className="auth-input aviso-editor-texto"
              rows={2}
              maxLength={180}
              value={formulario.cuerpo}
              onFocus={() => (ultimoCampo.current = 'cuerpo')}
              onChange={(event) => cambiar('cuerpo', event.target.value)}
            />
          </label>
          {formulario.variables.length > 0 && (
            <div className="aviso-editor-datos">
              <small className="aviso-editor-ayuda">
                Datos que se completan solos (tocá uno para agregarlo donde está el cursor):
              </small>
              <div className="chips-lista">
                {formulario.variables.map((variable) => (
                  <button
                    key={variable.clave}
                    type="button"
                    className="chip"
                    title={variable.texto}
                    onClick={() => insertarDato(variable.clave)}
                  >
                    {variable.texto}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!textoOriginal && (
            <button
              type="button"
              className="boton-texto-plano aviso-editor-original"
              onClick={() =>
                setFormulario((actual) => ({
                  ...actual,
                  titulo: actual.tituloOriginal,
                  cuerpo: actual.cuerpoOriginal,
                }))
              }
            >
              Volver al texto original
            </button>
          )}
        </fieldset>

        <div className="aviso-vista-previa" aria-label="Vista previa">
          <img src="/icon-192.png" alt="" className="aviso-vista-previa-icono" />
          <span>
            <strong>{rellenarAviso(formulario.titulo, ejemplos) || 'Sin título'}</strong>
            <small>{rellenarAviso(formulario.cuerpo, ejemplos)}</small>
          </span>
        </div>
        <small className="aviso-editor-ayuda">Vista previa con datos de ejemplo.</small>

        {mensaje && <p className="auth-message">{mensaje}</p>}

        <div className="aviso-editor-botones">
          <button type="button" className="boton-secundario" onClick={probar} disabled={probando}>
            {probando ? 'Enviando…' : 'Enviarme una prueba'}
          </button>
          <button type="submit" className="boton-principal" disabled={guardando || !cambiado}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </HojaInferior>
  )
}

// "Cuándo sale": hora, días, o los plazos de Ajustes → Plazos.
function Cuando({ formulario, extras, onCambiar }) {
  const programada = formulario.disparo === 'horario'
  if (!programada && !formulario.diasEtiqueta) return null
  return (
    <fieldset className="aviso-editor-grupo">
      <legend>Cuándo sale</legend>
      <div className="aviso-editor-fila">
        {programada && (
          <label className="ajustes-campo">
            <span>{formulario.clave === 'hoy' ? 'Hora general' : 'Hora'}</span>
            <input
              className="auth-input"
              type="time"
              step="300"
              required
              value={formulario.hora}
              onChange={(event) => onCambiar('hora', event.target.value)}
            />
          </label>
        )}
        {formulario.diasEtiqueta && (
          <label className="ajustes-campo">
            <span>{formulario.diasEtiqueta}</span>
            <input
              className="auth-input"
              type="number"
              min="1"
              max="60"
              inputMode="numeric"
              value={formulario.dias ?? ''}
              onChange={(event) => onCambiar('dias', event.target.value)}
            />
          </label>
        )}
      </div>
      {formulario.clave === 'vence-antes' && (
        <small className="aviso-editor-ayuda">
          Sale {extras.diasAviso} días antes de vencer. Los días se cambian en{' '}
          <Link to="/profe/ajustes?tab=plazos">Ajustes → Plazos</Link>.
        </small>
      )}
      {formulario.clave === 'gracia' && (
        <small className="aviso-editor-ayuda">
          Días de gracia: {extras.diasGracia}. Se cambian en{' '}
          <Link to="/profe/ajustes?tab=plazos">Ajustes → Plazos</Link>.
        </small>
      )}
      {programada && (
        <small className="aviso-editor-ayuda">
          Hora de Uruguay. Si en ese momento no hay nada para avisar, no sale.
        </small>
      )}
    </fieldset>
  )
}
