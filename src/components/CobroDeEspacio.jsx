import { useEffect, useState } from 'react'
import Esqueleto from './Esqueleto.jsx'
import { mostrarAviso } from '../services/avisos.js'
import { guardarPlanDeEspacio, useConfiguracion } from '../services/configuracion.js'
import { COBRO_VACIO, cargarDatosDeCobro, guardarDatosDeCobro } from '../services/cobroEspacio.js'
import { formatearPrecio, listaDePlanes } from '../data/planes.js'

// Lo que cobra un espacio (profe o gimnasio) a sus alumnos, supabase/sql/
// 034. Lo usan el panel del dueño (Cobros → Mis planes / Datos de cobro,
// pages/ProfeCuentas.jsx) y el Admin (Ajustes → Cobro de alumnos).
//
//   · PlanesDelEspacio: sus planes (nombre, descripción, precios, link de
//     Mercado Pago, visible o no) y planes nuevos. Los planes no se borran
//     porque hay alumnos que los tienen: se ocultan.
//   · DatosDeCobroDelEspacio: banco, titular, cuenta, moneda, alias y link
//     general de Mercado Pago. Los ven sus alumnos al registrarse y en
//     Suscripción.
//
// La base revisa que quien guarda sea el dueño del espacio o el Admin.

// Aviso según lo que respondió la base. Devuelve true si salió bien.
function avisarResultado(error, textoOk) {
  if (!error) {
    mostrarAviso(textoOk)
    return true
  }
  const texto = error.message || ''
  const faltaBase = /does not exist|schema cache|could not find the function/i.test(texto)
  const deLaBase = /^(Solo|Poné|Revisá|Ese plan|El link|Ya tenés)/.test(texto)
  mostrarAviso(
    faltaBase
      ? 'Falta instalar la actualización de la base (SQL 034)'
      : deLaBase
        ? texto
        : 'No pudimos guardar. Probá de nuevo.',
    'error',
  )
  return false
}

// --- Planes ------------------------------------------------------------------

const PLAN_VACIO = {
  nombre: '',
  descripcion: '',
  precioPrimerMes: '',
  precioDesdeSegundoMes: '',
  linkMercadoPago: '',
  activo: true,
}

export function PlanesDelEspacio({ espacioId }) {
  const config = useConfiguracion() // se vuelve a dibujar al guardar
  const planes = listaDePlanes({ espacioId })
  const [creando, setCreando] = useState(false)

  return (
    <>
      <p className="profe-nota">
        Los planes que ofrecés a tus alumnos. Los precios nuevos valen para los próximos pagos (lo
        que ya se cobró no cambia). Los planes no se borran porque hay alumnos que los tienen: si ya
        no lo ofrecés, ocultalo.
      </p>
      {planes.length === 0 && !creando && (
        <p className="profe-vacio">
          Todavía no tenés planes: creá al menos uno para que tus alumnos lo elijan al registrarse.
        </p>
      )}
      <div className="lista-tarjetas">
        {planes.map((plan) => (
          <FormularioPlan
            key={`${plan.id}-${plan.nombre}-${plan.precioDesdeSegundoMes}-${plan.activo}`}
            espacioId={espacioId}
            plan={plan}
            cobroAutomatico={config.cobroAutomatico}
          />
        ))}
      </div>

      {creando ? (
        <FormularioPlan
          espacioId={espacioId}
          plan={PLAN_VACIO}
          cobroAutomatico={config.cobroAutomatico}
          nuevo
          onListo={() => setCreando(false)}
        />
      ) : (
        <button
          type="button"
          className="boton-secundario ajustes-nuevo-plan"
          onClick={() => setCreando(true)}
        >
          + Crear un plan nuevo
        </button>
      )}
    </>
  )
}

function FormularioPlan({ espacioId, plan, cobroAutomatico, nuevo = false, onListo }) {
  const [formulario, setFormulario] = useState(() => ({
    ...plan,
    precioPrimerMes: String(plan.precioPrimerMes ?? ''),
    precioDesdeSegundoMes: String(plan.precioDesdeSegundoMes ?? ''),
    linkMercadoPago: plan.linkMercadoPago || '',
    descripcion: plan.descripcion || '',
  }))
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const cambiado =
    nuevo ||
    [
      'nombre',
      'descripcion',
      'precioPrimerMes',
      'precioDesdeSegundoMes',
      'linkMercadoPago',
      'activo',
    ].some((campo) => String(formulario[campo] ?? '') !== String(plan[campo] ?? ''))

  function cambiar(campo, valor) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }))
    setMensaje('')
  }

  async function guardar(event) {
    event.preventDefault()
    const problema = revisarPlan(formulario)
    if (problema) {
      setMensaje(problema)
      return
    }
    setGuardando(true)
    const error = await guardarPlanDeEspacio(espacioId, nuevo ? null : plan.id, formulario)
    setGuardando(false)
    if (avisarResultado(error, nuevo ? 'Plan creado' : 'Plan guardado')) onListo?.()
  }

  return (
    <form
      className={formulario.activo ? 'ajustes-tarjeta' : 'ajustes-tarjeta ajustes-tarjeta-oculta'}
      onSubmit={guardar}
    >
      <div className="ajustes-tarjeta-cabecera">
        <strong>{nuevo ? 'Plan nuevo' : plan.nombre}</strong>
        {!nuevo && (
          <small>
            {formatearPrecio(plan.precioPrimerMes)} el primer mes ·{' '}
            {formatearPrecio(plan.precioDesdeSegundoMes)} por mes
            {plan.activo === false ? ' · oculto' : ''}
          </small>
        )}
      </div>

      <Campo etiqueta="Nombre">
        <input
          className="auth-input"
          type="text"
          maxLength={80}
          value={formulario.nombre}
          onChange={(event) => cambiar('nombre', event.target.value)}
          placeholder="Ej. Plan seguimiento"
        />
      </Campo>
      <Campo etiqueta="Descripción (la ve el alumno al elegir)">
        <input
          className="auth-input"
          type="text"
          maxLength={300}
          value={formulario.descripcion}
          onChange={(event) => cambiar('descripcion', event.target.value)}
          placeholder="Qué incluye"
        />
      </Campo>
      <div className="codigo-fila">
        <Campo etiqueta="Primer mes ($U)">
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
        <Campo etiqueta="Por mes ($U)">
          <input
            className="auth-input"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={formulario.precioDesdeSegundoMes}
            onChange={(event) => cambiar('precioDesdeSegundoMes', event.target.value)}
          />
        </Campo>
      </div>
      {!cobroAutomatico && (
        <Campo etiqueta="Link de pago de Mercado Pago de este plan (opcional)">
          <input
            className="auth-input"
            type="url"
            value={formulario.linkMercadoPago}
            onChange={(event) => cambiar('linkMercadoPago', event.target.value)}
            placeholder="https://mpago.la/…"
          />
        </Campo>
      )}
      <label className="form-checkbox-row">
        <input
          type="checkbox"
          checked={formulario.activo !== false}
          onChange={(event) => cambiar('activo', event.target.checked)}
        />
        <span>Se ofrece al registrarse (si lo destildás, queda oculto)</span>
      </label>

      {mensaje && <p className="auth-message">{mensaje}</p>}
      <div className="codigo-fila">
        {nuevo && (
          <button type="button" className="boton-secundario boton-chico" onClick={onListo}>
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

// Devuelve el problema a corregir, o '' si está todo bien.
function revisarPlan(plan) {
  if (!plan.nombre.trim()) return 'Poné un nombre para el plan.'
  for (const [campo, texto] of [
    ['precioPrimerMes', 'el primer mes'],
    ['precioDesdeSegundoMes', 'cada mes'],
  ]) {
    const valor = Number(plan[campo])
    if (plan[campo] === '' || !Number.isInteger(valor) || valor < 0) {
      return `Poné el precio de ${texto} en pesos, sin puntos ni decimales (ej. 1500).`
    }
  }
  if (plan.linkMercadoPago && !/^https:\/\//i.test(plan.linkMercadoPago.trim())) {
    return 'El link de Mercado Pago tiene que empezar con https://'
  }
  return ''
}

// --- Datos de cobro ------------------------------------------------------------

const CAMPOS_COBRO = [
  ['banco', 'Banco', 'Ej. BROU'],
  ['titular', 'Titular', 'Nombre de quien recibe'],
  ['cuenta', 'Número de cuenta', 'Ej. 000123456-00001'],
  ['moneda', 'Moneda', 'Ej. Pesos'],
  ['alias', 'Alias o dato extra (opcional)', 'Ej. mi.alias o "Abitab a nombre de…"'],
  ['linkMercadoPago', 'Link general de Mercado Pago (opcional)', 'https://mpago.la/…'],
]

export function DatosDeCobroDelEspacio({ espacioId }) {
  const [guardados, setGuardados] = useState(null)
  const [datos, setDatos] = useState(COBRO_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    let vigente = true
    setGuardados(null)
    cargarDatosDeCobro(espacioId).then(({ datos: cargados }) => {
      if (!vigente) return
      setGuardados(cargados)
      setDatos(cargados)
    })
    return () => {
      vigente = false
    }
  }, [espacioId])

  if (!guardados) return <Esqueleto />

  const cambiado = CAMPOS_COBRO.some(([campo]) => (datos[campo] || '') !== guardados[campo])

  async function guardar(event) {
    event.preventDefault()
    const link = datos.linkMercadoPago.trim()
    if (link && !/^https:\/\//i.test(link)) {
      setMensaje('El link de Mercado Pago tiene que empezar con https://')
      return
    }
    setMensaje('')
    setGuardando(true)
    const error = await guardarDatosDeCobro(espacioId, datos)
    setGuardando(false)
    if (avisarResultado(error, 'Datos de cobro guardados')) {
      const limpios = Object.fromEntries(
        Object.entries(datos).map(([campo, valor]) => [campo, (valor || '').trim()]),
      )
      setGuardados(limpios)
      setDatos(limpios)
    }
  }

  return (
    <>
      <p className="profe-nota">
        Cómo te pagan tus alumnos. Los ven al registrarse y en su pantalla de Suscripción. Dejá
        vacío lo que no quieras mostrar. Si un plan tiene su propio link de Mercado Pago, se usa
        ese.
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

export function Campo({ etiqueta, children }) {
  return (
    <label className="ajustes-campo">
      <span>{etiqueta}</span>
      {children}
    </label>
  )
}
