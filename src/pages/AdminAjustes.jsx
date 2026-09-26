import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Pestanas from '../components/Pestanas.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { mostrarAviso } from '../services/avisos.js'
import {
  cargarConfiguracion,
  crearPlan,
  guardarAjustes,
  guardarPlan,
  useConfiguracion,
} from '../services/configuracion.js'
import { formatearPrecio, listaDePlanes } from '../data/planes.js'

// Ajustes del negocio (solo el Admin). Todo se guarda en la base (tablas
// "planes" y "ajustes", supabase/sql/022) y la app lo usa al instante:
// no hace falta entrar a Supabase ni cambiar código. Cada cambio queda
// anotado en el Historial.
//
//   · Planes: nombre, descripción, precios, link de Mercado Pago y si se
//     ofrece al registrarse. Planes nuevos.
//   · Cobro: datos para transferencia y cobro automático con Mercado Pago.
//   · WhatsApp: link del grupo de la comunidad.
//   · Plazos: días de aviso antes del vencimiento y días de gracia.
const PESTANAS = [
  { id: 'planes', label: 'Planes' },
  { id: 'cobro', label: 'Cobro' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'plazos', label: 'Plazos' },
]

export default function AdminAjustes() {
  const config = useConfiguracion()
  const [parametros, setParametros] = useSearchParams()
  const pestana = PESTANAS.some((item) => item.id === parametros.get('tab'))
    ? parametros.get('tab')
    : 'planes'
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargarConfiguracion().finally(() => setCargando(false))
  }, [])

  return (
    <ProfeLayout titulo="Ajustes" soloAdmin>
      <Pestanas
        etiqueta="Sección de ajustes"
        opciones={PESTANAS}
        activa={pestana}
        onCambiar={(id) => setParametros({ tab: id }, { replace: true })}
      />

      {cargando ? (
        <Esqueleto />
      ) : pestana === 'planes' ? (
        <SeccionPlanes cobroAutomatico={config.cobroAutomatico} />
      ) : pestana === 'cobro' ? (
        <SeccionCobro config={config} />
      ) : pestana === 'whatsapp' ? (
        <SeccionWhatsapp config={config} />
      ) : (
        <SeccionPlazos config={config} />
      )}

      <Link to="/profe/ajustes/historial" className="boton-secundario ajustes-historial">
        Ver historial de cambios
      </Link>
    </ProfeLayout>
  )
}

// Aviso según lo que respondió la base.
function avisarResultado(error, textoOk) {
  if (!error) {
    mostrarAviso(textoOk)
    return true
  }
  const faltaBase = /ajustes|link_mp|descripcion|does not exist|schema cache/i.test(
    error.message || '',
  )
  mostrarAviso(
    faltaBase
      ? 'Falta instalar la actualización de la base (SQL 022)'
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

function SeccionPlanes({ cobroAutomatico }) {
  const planes = listaDePlanes()
  const [creando, setCreando] = useState(false)

  return (
    <>
      <p className="profe-nota">
        Los precios nuevos valen para los próximos pagos (lo que ya se cobró no cambia). Los planes
        no se borran porque hay clientes que los tienen: si ya no lo ofrecés, ocultalo.
      </p>
      <div className="lista-tarjetas">
        {planes.map((plan) => (
          <FormularioPlan key={plan.id} plan={plan} cobroAutomatico={cobroAutomatico} />
        ))}
      </div>

      {creando ? (
        <FormularioPlan
          plan={PLAN_VACIO}
          cobroAutomatico={cobroAutomatico}
          nuevo
          idsExistentes={planes.map((plan) => plan.id)}
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

function FormularioPlan({ plan, cobroAutomatico, nuevo = false, idsExistentes = [], onListo }) {
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
    const error = nuevo
      ? await crearPlan(formulario, idsExistentes)
      : await guardarPlan(plan.id, formulario)
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
          value={formulario.nombre}
          onChange={(event) => cambiar('nombre', event.target.value)}
          placeholder="Ej. Plan seguimiento"
        />
      </Campo>
      <Campo etiqueta="Descripción (la ve el cliente al elegir)">
        <input
          className="auth-input"
          type="text"
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
        <Campo etiqueta="Link de pago de Mercado Pago (opcional)">
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
  if (plan.linkMercadoPago && !/^https?:\/\//i.test(plan.linkMercadoPago.trim())) {
    return 'El link de Mercado Pago tiene que empezar con https://'
  }
  return ''
}

// --- Cobro -------------------------------------------------------------------

function SeccionCobro({ config }) {
  const [datos, setDatos] = useState(() => ({ ...config.transferencia }))
  const [guardando, setGuardando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const cambiado = ['banco', 'titular', 'cuenta', 'moneda'].some(
    (campo) => (datos[campo] || '') !== (config.transferencia[campo] || ''),
  )

  async function guardarTransferencia(event) {
    event.preventDefault()
    setGuardando(true)
    const error = await guardarAjustes({ transferencia: datos })
    setGuardando(false)
    avisarResultado(error, 'Datos para transferencia guardados')
  }

  async function cambiarCobroAutomatico(valor) {
    setConfirmando(false)
    const error = await guardarAjustes({ cobroAutomatico: valor })
    avisarResultado(error, valor ? 'Cobro automático activado' : 'Cobro automático desactivado')
  }

  return (
    <>
      <p className="profe-seccion-label">Datos para transferencia</p>
      <p className="profe-nota">
        Los ven los clientes al registrarse y en Suscripción. Dejá vacío lo que no quieras mostrar.
      </p>
      <form className="ajustes-tarjeta" onSubmit={guardarTransferencia}>
        {[
          ['banco', 'Banco', 'Ej. BROU'],
          ['titular', 'Titular', 'Nombre de quien recibe'],
          ['cuenta', 'Número de cuenta', 'Ej. 000123456-00001'],
          ['moneda', 'Moneda', 'Ej. Pesos'],
        ].map(([campo, etiqueta, ejemplo]) => (
          <Campo key={campo} etiqueta={etiqueta}>
            <input
              className="auth-input"
              type="text"
              value={datos[campo] || ''}
              placeholder={ejemplo}
              onChange={(event) =>
                setDatos((actual) => ({ ...actual, [campo]: event.target.value }))
              }
            />
          </Campo>
        ))}
        <button
          type="submit"
          className="boton-principal boton-chico"
          disabled={guardando || !cambiado}
        >
          {guardando ? 'Guardando…' : 'Guardar datos'}
        </button>
      </form>

      <p className="profe-seccion-label">Cobro automático con Mercado Pago</p>
      <div className="ajustes-tarjeta">
        <div className="ajustes-interruptor">
          <span className="ajustes-interruptor-texto">
            <strong>{config.cobroAutomatico ? 'Activado' : 'Desactivado'}</strong>
            <small>
              {config.cobroAutomatico
                ? 'El cliente paga con tarjeta desde la app y la cuenta se habilita sola.'
                : 'Los clientes pagan con el link de cada plan o por transferencia, y la cuenta se habilita desde Pagos.'}
            </small>
          </span>
          <button
            type="button"
            className={config.cobroAutomatico ? 'interruptor interruptor-on' : 'interruptor'}
            role="switch"
            aria-checked={config.cobroAutomatico}
            aria-label="Cobro automático con Mercado Pago"
            onClick={() =>
              config.cobroAutomatico ? cambiarCobroAutomatico(false) : setConfirmando(true)
            }
          />
        </div>
        {confirmando && (
          <div className="aviso-baja">
            <strong>¿Ya está configurado Mercado Pago?</strong>
            <span>
              Activalo solo si ya hiciste el paso de Mercado Pago de la guía (funciones de Supabase
              y token). Si no, los clientes no van a poder pagar con tarjeta.
            </span>
            <div className="equipo-confirmar">
              <button
                type="button"
                className="boton-principal boton-chico"
                onClick={() => cambiarCobroAutomatico(true)}
              >
                Sí, activar
              </button>
              <button
                type="button"
                className="boton-secundario boton-chico"
                onClick={() => setConfirmando(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// --- WhatsApp ----------------------------------------------------------------

function SeccionWhatsapp({ config }) {
  const [link, setLink] = useState(config.whatsappGrupoUrl || '')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function guardar(event) {
    event.preventDefault()
    const valor = link.trim()
    if (valor && !/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(valor)) {
      setMensaje('El link tiene que empezar con https://chat.whatsapp.com/')
      return
    }
    setMensaje('')
    setGuardando(true)
    const error = await guardarAjustes({ whatsappGrupoUrl: valor })
    setGuardando(false)
    avisarResultado(error, valor ? 'Link del grupo guardado' : 'Link del grupo borrado')
  }

  return (
    <>
      <p className="profe-seccion-label">Grupo de WhatsApp de la comunidad</p>
      <p className="profe-nota">
        En WhatsApp: abrí el grupo → tocá el nombre → "Invitar al grupo mediante enlace" → "Copiar
        enlace", y pegalo acá. Los clientes lo ven en Comunidad.
      </p>
      <form className="ajustes-tarjeta" onSubmit={guardar}>
        <Campo etiqueta="Link de invitación">
          <input
            className="auth-input"
            type="url"
            value={link}
            placeholder="https://chat.whatsapp.com/…"
            onChange={(event) => {
              setLink(event.target.value)
              setMensaje('')
            }}
          />
        </Campo>
        {mensaje && <p className="auth-message">{mensaje}</p>}
        <button
          type="submit"
          className="boton-principal boton-chico"
          disabled={guardando || link.trim() === (config.whatsappGrupoUrl || '')}
        >
          {guardando ? 'Guardando…' : 'Guardar link'}
        </button>
      </form>
    </>
  )
}

// --- Plazos ------------------------------------------------------------------

function SeccionPlazos({ config }) {
  const [diasAviso, setDiasAviso] = useState(String(config.diasAviso))
  const [diasDeGracia, setDiasDeGracia] = useState(String(config.diasDeGracia))
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const cambiado =
    diasAviso !== String(config.diasAviso) || diasDeGracia !== String(config.diasDeGracia)

  async function guardar(event) {
    event.preventDefault()
    const valores = [Number(diasAviso), Number(diasDeGracia)]
    if (
      valores.some(
        (valor) =>
          diasAviso === '' ||
          diasDeGracia === '' ||
          !Number.isInteger(valor) ||
          valor < 0 ||
          valor > 30,
      )
    ) {
      setMensaje('Poné un número de días entre 0 y 30.')
      return
    }
    setMensaje('')
    setGuardando(true)
    const error = await guardarAjustes({ diasAviso: valores[0], diasDeGracia: valores[1] })
    setGuardando(false)
    avisarResultado(error, 'Plazos guardados')
  }

  return (
    <>
      <p className="profe-seccion-label">Vencimiento del plan</p>
      <form className="ajustes-tarjeta" onSubmit={guardar}>
        <Campo etiqueta="Avisar al cliente cuántos días antes de que venza">
          <input
            className="auth-input"
            type="number"
            min="0"
            max="30"
            inputMode="numeric"
            value={diasAviso}
            onChange={(event) => setDiasAviso(event.target.value)}
          />
        </Campo>
        <Campo etiqueta="Días de gracia (sigue entrenando después de vencer)">
          <input
            className="auth-input"
            type="number"
            min="0"
            max="30"
            inputMode="numeric"
            value={diasDeGracia}
            onChange={(event) => setDiasDeGracia(event.target.value)}
          />
        </Campo>
        <p className="profe-nota">
          Pasados los días de gracia sin pagar, el cliente deja de ver sus rutinas hasta que pague
          (su historial no se borra). El texto de los términos se actualiza solo.
        </p>
        {mensaje && <p className="auth-message">{mensaje}</p>}
        <button
          type="submit"
          className="boton-principal boton-chico"
          disabled={guardando || !cambiado}
        >
          {guardando ? 'Guardando…' : 'Guardar plazos'}
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
