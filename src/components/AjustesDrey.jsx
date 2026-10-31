import { useEffect, useState } from 'react'
import Esqueleto from './Esqueleto.jsx'
import { mostrarAviso } from '../services/avisos.js'
import { guardarAjustes } from '../services/configuracion.js'
import {
  cargarPlanesDrey,
  crearPlanDrey,
  guardarPlanDrey,
  revisarPlanDrey,
} from '../services/suscripcionDrey.js'
import { formatearPrecio } from '../data/planes.js'

// Admin → Ajustes → "DREY": lo que cobra DREY a los profes y gimnasios
// (cobro por cupos, supabase/sql/032).
//
//   · Planes DREY: nombre, para quién (profe o gimnasio), cuántos alumnos,
//     precio por mes (y del primer mes, si es distinto), link de Mercado
//     Pago y si se ofrece. Planes nuevos. No se borran: se ocultan.
//   · Prueba gratis: prendida o apagada, cuántos días y cuántos alumnos.
//   · Cobro de DREY: los datos para transferencia que ven los profes y
//     gimnasios en "Suscripción DREY" (los de los alumnos siguen en Cobro).
// Cada cambio queda en el Historial.
const PLAN_VACIO = {
  nombre: '',
  tipo: 'profe',
  cupos: '',
  precioMensual: '',
  precioPrimerMes: '',
  linkMercadoPago: '',
  descripcion: '',
  activo: true,
}

export default function AjustesDrey({ config }) {
  return (
    <>
      <SeccionPlanesDrey />
      <SeccionPrueba config={config} />
      <SeccionCobroDrey config={config} />
    </>
  )
}

function avisarResultado(error, textoOk) {
  if (!error) {
    mostrarAviso(textoOk)
    return true
  }
  const faltaBase = /planes_drey|prueba_|drey_|does not exist|schema cache/i.test(
    error.message || '',
  )
  mostrarAviso(
    faltaBase
      ? 'Falta instalar la actualización de la base (SQL 032)'
      : 'No pudimos guardar. Probá de nuevo.',
    'error',
  )
  return false
}

// --- Planes DREY ---------------------------------------------------------------

function SeccionPlanesDrey() {
  const [cargando, setCargando] = useState(true)
  const [planes, setPlanes] = useState([])
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const { planes: lista } = await cargarPlanesDrey()
    setPlanes(lista)
    setCargando(false)
  }

  return (
    <>
      <p className="profe-seccion-label">Planes DREY</p>
      <p className="profe-nota">
        Lo que pagan los profes y gimnasios por mes, según cuántos alumnos pueden tener habilitados
        a la vez. Los precios nuevos valen para los próximos pagos. Si un plan ya no se ofrece,
        ocultalo (los espacios que lo tienen lo siguen teniendo).
      </p>
      {cargando ? (
        <Esqueleto filas={2} />
      ) : (
        <div className="lista-tarjetas">
          {planes.map((plan) => (
            <FormularioPlanDrey key={plan.id} plan={plan} onListo={cargar} />
          ))}
        </div>
      )}
      {creando ? (
        <FormularioPlanDrey
          plan={PLAN_VACIO}
          nuevo
          existentes={planes}
          onListo={() => {
            setCreando(false)
            cargar()
          }}
          onCancelar={() => setCreando(false)}
        />
      ) : (
        <button
          type="button"
          className="boton-secundario ajustes-nuevo-plan"
          onClick={() => setCreando(true)}
        >
          + Crear un plan DREY
        </button>
      )}
    </>
  )
}

function FormularioPlanDrey({ plan, nuevo = false, existentes = [], onListo, onCancelar }) {
  const inicial = {
    ...plan,
    cupos: String(plan.cupos ?? ''),
    precioMensual: String(plan.precioMensual ?? ''),
    precioPrimerMes: plan.precioPrimerMes == null ? '' : String(plan.precioPrimerMes),
  }
  const [formulario, setFormulario] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const cambiado =
    nuevo ||
    [
      'nombre',
      'tipo',
      'cupos',
      'precioMensual',
      'precioPrimerMes',
      'linkMercadoPago',
      'descripcion',
      'activo',
    ].some((campo) => String(formulario[campo] ?? '') !== String(inicial[campo] ?? ''))

  function cambiar(campo, valor) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }))
    setMensaje('')
  }

  async function guardar(event) {
    event.preventDefault()
    const problema = revisarPlanDrey(formulario)
    if (problema) {
      setMensaje(problema)
      return
    }
    setGuardando(true)
    const error = nuevo
      ? await crearPlanDrey(formulario, existentes)
      : await guardarPlanDrey(plan.id, formulario)
    setGuardando(false)
    if (avisarResultado(error, nuevo ? 'Plan DREY creado' : 'Plan DREY guardado')) onListo?.()
  }

  return (
    <form
      className={formulario.activo ? 'ajustes-tarjeta' : 'ajustes-tarjeta ajustes-tarjeta-oculta'}
      onSubmit={guardar}
    >
      <div className="ajustes-tarjeta-cabecera">
        <strong>{nuevo ? 'Plan DREY nuevo' : plan.nombre}</strong>
        {!nuevo && (
          <small>
            {plan.tipo === 'gimnasio' ? 'Gimnasio' : 'Profe'} · {plan.cupos} alumnos ·{' '}
            {formatearPrecio(plan.precioMensual)} por mes
            {plan.activo === false ? ' · oculto' : ''}
          </small>
        )}
      </div>

      <div className="codigo-fila">
        <Campo etiqueta="Nombre">
          <input
            className="auth-input"
            type="text"
            value={formulario.nombre}
            onChange={(event) => cambiar('nombre', event.target.value)}
            placeholder="Ej. Profe 25"
          />
        </Campo>
        <Campo etiqueta="Para">
          <select
            className="auth-input"
            value={formulario.tipo}
            onChange={(event) => cambiar('tipo', event.target.value)}
          >
            <option value="profe">Profes</option>
            <option value="gimnasio">Gimnasios</option>
          </select>
        </Campo>
      </div>
      <div className="codigo-fila">
        <Campo etiqueta="Alumnos (cupos)">
          <input
            className="auth-input"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={formulario.cupos}
            onChange={(event) => cambiar('cupos', event.target.value)}
          />
        </Campo>
        <Campo etiqueta="Por mes ($U)">
          <input
            className="auth-input"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={formulario.precioMensual}
            onChange={(event) => cambiar('precioMensual', event.target.value)}
          />
        </Campo>
      </div>
      <Campo etiqueta="Primer mes ($U, vacío = igual que por mes)">
        <input
          className="auth-input"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={formulario.precioPrimerMes}
          onChange={(event) => cambiar('precioPrimerMes', event.target.value)}
        />
      </Campo>
      <Campo etiqueta="Descripción (opcional)">
        <input
          className="auth-input"
          type="text"
          value={formulario.descripcion}
          onChange={(event) => cambiar('descripcion', event.target.value)}
          placeholder="Qué incluye"
        />
      </Campo>
      <Campo etiqueta="Link de pago de Mercado Pago (opcional)">
        <input
          className="auth-input"
          type="url"
          value={formulario.linkMercadoPago}
          onChange={(event) => cambiar('linkMercadoPago', event.target.value)}
          placeholder="https://mpago.la/…"
        />
      </Campo>
      <label className="form-checkbox-row">
        <input
          type="checkbox"
          checked={formulario.activo !== false}
          onChange={(event) => cambiar('activo', event.target.checked)}
        />
        <span>Se ofrece (si lo destildás, queda oculto)</span>
      </label>

      {mensaje && <p className="auth-message">{mensaje}</p>}
      <div className="codigo-fila">
        {nuevo && (
          <button type="button" className="boton-secundario boton-chico" onClick={onCancelar}>
            Cancelar
          </button>
        )}
        <button
          type="submit"
          className="boton-principal boton-chico"
          disabled={guardando || !cambiado}
        >
          {guardando ? 'Guardando…' : nuevo ? 'Crear plan' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

// --- Prueba gratis ---------------------------------------------------------

function SeccionPrueba({ config }) {
  const prueba = config.prueba || { activa: true, dias: 14, cupos: 3 }
  const [activa, setActiva] = useState(Boolean(prueba.activa))
  const [dias, setDias] = useState(String(prueba.dias ?? 14))
  const [cupos, setCupos] = useState(String(prueba.cupos ?? 3))
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const cambiado =
    activa !== Boolean(prueba.activa) ||
    dias !== String(prueba.dias ?? 14) ||
    cupos !== String(prueba.cupos ?? 3)

  async function guardar(event) {
    event.preventDefault()
    const nDias = Number(dias)
    const nCupos = Number(cupos)
    if (!Number.isInteger(nDias) || nDias < 1 || nDias > 90) {
      setMensaje('Los días de prueba van de 1 a 90.')
      return
    }
    if (!Number.isInteger(nCupos) || nCupos < 0 || nCupos > 100) {
      setMensaje('Los alumnos de la prueba van de 0 a 100.')
      return
    }
    setMensaje('')
    setGuardando(true)
    const error = await guardarAjustes({ prueba: { activa, dias: nDias, cupos: nCupos } })
    setGuardando(false)
    avisarResultado(error, 'Prueba gratis guardada')
  }

  return (
    <>
      <p className="profe-seccion-label">Prueba gratis</p>
      <form className="ajustes-tarjeta" onSubmit={guardar}>
        <div className="ajustes-interruptor">
          <span className="ajustes-interruptor-texto">
            <strong>{activa ? 'Prendida' : 'Apagada'}</strong>
            <small>
              {activa
                ? 'Cada profe o gimnasio nuevo empieza con una prueba gratis, sin tarjeta.'
                : 'Los profes y gimnasios nuevos tienen que elegir y pagar un plan para habilitar alumnos.'}
            </small>
          </span>
          <button
            type="button"
            className={activa ? 'interruptor interruptor-on' : 'interruptor'}
            role="switch"
            aria-checked={activa}
            aria-label="Prueba gratis"
            onClick={() => setActiva((valor) => !valor)}
          />
        </div>
        <div className="codigo-fila">
          <Campo etiqueta="Días de prueba">
            <input
              className="auth-input"
              type="number"
              min="1"
              max="90"
              inputMode="numeric"
              value={dias}
              onChange={(event) => setDias(event.target.value)}
            />
          </Campo>
          <Campo etiqueta="Alumnos en la prueba">
            <input
              className="auth-input"
              type="number"
              min="0"
              max="100"
              inputMode="numeric"
              value={cupos}
              onChange={(event) => setCupos(event.target.value)}
            />
          </Campo>
        </div>
        <p className="profe-nota">
          Vale para los espacios que se crean desde ahora; los que ya están en prueba siguen con su
          fecha (se cambia a mano en Equipo → Espacios). Los alumnos de la prueba sí cambian para
          todos.
        </p>
        {mensaje && <p className="auth-message">{mensaje}</p>}
        <button
          type="submit"
          className="boton-principal boton-chico"
          disabled={guardando || !cambiado}
        >
          {guardando ? 'Guardando…' : 'Guardar prueba gratis'}
        </button>
      </form>
    </>
  )
}

// --- Cobro de DREY ---------------------------------------------------------

const CAMPOS_COBRO = [
  ['banco', 'Banco', 'Ej. BROU'],
  ['titular', 'Titular', 'Nombre de quien recibe'],
  ['cuenta', 'Número de cuenta', 'Ej. 000123456-00001'],
  ['moneda', 'Moneda', 'Ej. Pesos'],
  ['linkMercadoPago', 'Link de Mercado Pago general (opcional)', 'https://mpago.la/…'],
]

function SeccionCobroDrey({ config }) {
  const guardados = config.dreyCobro || {}
  const [datos, setDatos] = useState(() => ({ ...guardados }))
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const cambiado = CAMPOS_COBRO.some(([campo]) => (datos[campo] || '') !== (guardados[campo] || ''))

  async function guardar(event) {
    event.preventDefault()
    const link = (datos.linkMercadoPago || '').trim()
    if (link && !/^https:\/\//i.test(link)) {
      setMensaje('El link de Mercado Pago tiene que empezar con https://')
      return
    }
    setMensaje('')
    setGuardando(true)
    const error = await guardarAjustes({ dreyCobro: datos })
    setGuardando(false)
    avisarResultado(error, 'Datos de cobro de DREY guardados')
  }

  return (
    <>
      <p className="profe-seccion-label">Cobro de DREY</p>
      <p className="profe-nota">
        Los ven los profes y gimnasios en "Suscripción DREY" para pagarte. Si un plan tiene su
        propio link de Mercado Pago, se usa ese; si no, el general de acá. (Los datos que ven los
        alumnos siguen en la pestaña Cobro.)
      </p>
      <form className="ajustes-tarjeta" onSubmit={guardar}>
        {CAMPOS_COBRO.map(([campo, etiqueta, ejemplo]) => (
          <Campo key={campo} etiqueta={etiqueta}>
            <input
              className="auth-input"
              type={campo === 'linkMercadoPago' ? 'url' : 'text'}
              value={datos[campo] || ''}
              placeholder={ejemplo}
              onChange={(event) => {
                setDatos((actual) => ({ ...actual, [campo]: event.target.value }))
                setMensaje('')
              }}
            />
          </Campo>
        ))}
        {mensaje && <p className="auth-message">{mensaje}</p>}
        <button
          type="submit"
          className="boton-principal boton-chico"
          disabled={guardando || !cambiado}
        >
          {guardando ? 'Guardando…' : 'Guardar datos'}
        </button>
      </form>
    </>
  )
}

function Campo({ etiqueta, children }) {
  return (
    <label className="ajustes-campo">
      <span>{etiqueta}</span>
      {children}
    </label>
  )
}
