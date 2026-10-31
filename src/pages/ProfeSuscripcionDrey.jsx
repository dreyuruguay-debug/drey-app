import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import BarraCupos from '../components/BarraCupos.jsx'
import { mostrarAviso } from '../services/avisos.js'
import { useConfiguracion, cargarConfiguracion } from '../services/configuracion.js'
import {
  actualizarMisEspacios,
  elegirEspacio,
  esDuenoDe,
  misEspaciosConocidos,
  nombreDeEspacio,
  useEspacios,
} from '../services/espacio.js'
import {
  METODOS_PAGO_DREY,
  avisarPagoDrey,
  cargarPagosDrey,
  cargarPlanesDrey,
  elegirPlanDrey,
} from '../services/suscripcionDrey.js'
import { estadoDeEspacio } from '../data/vencimiento.js'
import { formatearPrecio } from '../data/planes.js'
import { obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'

// "Suscripción DREY" (/profe/suscripcion): lo que el profe o el gimnasio
// le paga a DREY por sus cupos de alumnos (supabase/sql/032). Solo la ve
// el dueño del espacio elegido arriba (en su espacio personal, el profe).
//
//   · Plan, estado (prueba gratis, al día, vencido...) y barra de cupos
//     ("12 de 25 alumnos").
//   · Elegir o cambiar de plan: se aplica cuando DREY confirma el pago.
//   · Cómo pagar (datos de DREY y link de Mercado Pago) y "Ya pagué" con
//     comprobante: le llega al Admin, que lo confirma.
//   · Los pagos hechos.
export default function ProfeSuscripcionDrey() {
  const config = useConfiguracion()
  const { activo: espacio } = useEspacios()
  const [cargando, setCargando] = useState(true)
  const [planes, setPlanes] = useState([])
  const [pagos, setPagos] = useState([])
  const [faltaBase, setFaltaBase] = useState(false)
  const [guardando, setGuardando] = useState('')
  const [comprobante, setComprobante] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const espacioId = espacio?.id

  useEffect(() => {
    let abierta = true
    Promise.all([cargarPlanesDrey(), actualizarMisEspacios(), cargarConfiguracion()]).then(
      ([{ planes: lista, error }]) => {
        if (!abierta) return
        setPlanes(lista)
        setFaltaBase(Boolean(error) && !misEspaciosConocidos()?.length)
        setCargando(false)
      },
    )
    return () => {
      abierta = false
    }
  }, [])

  useEffect(() => {
    if (!espacioId || !esDuenoDe(espacio)) return
    cargarPagosDrey(espacioId).then(({ pagos: lista }) => setPagos(lista))
  }, [espacioId])

  if (cargando) {
    return (
      <ProfeLayout titulo="Suscripción DREY" volverA="/profe/mi-cuenta">
        <Esqueleto />
      </ProfeLayout>
    )
  }

  if (faltaBase || !espacio) {
    return (
      <ProfeLayout titulo="Suscripción DREY" volverA="/profe/mi-cuenta">
        <p className="profe-vacio">
          {faltaBase
            ? 'Falta instalar la actualización de la base (SQL 032).'
            : 'Tu cuenta todavía no tiene un espacio. Escribile a DREY.'}
        </p>
      </ProfeLayout>
    )
  }

  if (!esDuenoDe(espacio)) {
    const propio = (misEspaciosConocidos() || []).find((item) => esDuenoDe(item))
    return (
      <ProfeLayout titulo="Suscripción DREY" volverA="/profe/mi-cuenta">
        <p className="profe-vacio">
          La suscripción de {espacio.nombre} la maneja el dueño del gimnasio.
        </p>
        {propio && (
          <button
            type="button"
            className="boton-secundario"
            onClick={() => elegirEspacio(propio.id)}
          >
            Ver la de {nombreDeEspacio(propio).toLowerCase()}
          </button>
        )}
      </ProfeLayout>
    )
  }

  const hoy = obtenerFechaHoyISO()
  const estado = estadoDeEspacio(espacio, hoy)
  const planActual = planes.find((plan) => plan.id === espacio.planDrey)
  const planPedido = planes.find((plan) => plan.id === espacio.planPedido)
  const planAPagar = planPedido || planActual
  // Los planes del tipo del espacio (profe o gimnasio); si no hay
  // ninguno de ese tipo, todos.
  const visibles = planes.filter((plan) => plan.activo)
  const delTipo = visibles.filter((plan) => plan.tipo === espacio.tipo)
  const opciones = delTipo.length ? delTipo : visibles
  const dreyCobro = config.dreyCobro || {}
  const linkMercadoPago = planAPagar?.linkMercadoPago || dreyCobro.linkMercadoPago
  const datosTransferencia = [
    ['Banco', dreyCobro.banco],
    ['Titular', dreyCobro.titular],
    ['Cuenta', dreyCobro.cuenta],
    ['Moneda', dreyCobro.moneda],
  ].filter(([, valor]) => valor)

  async function elegir(planId) {
    setGuardando(planId)
    const error = await elegirPlanDrey(espacio.id, planId)
    if (!error) await actualizarMisEspacios()
    setGuardando('')
    mostrarAviso(
      error
        ? 'No pudimos elegir el plan. Probá de nuevo.'
        : 'Plan elegido. Ahora pagalo y avisanos.',
      error ? 'error' : 'ok',
    )
  }

  async function avisarPago(event) {
    event.preventDefault()
    setMensaje('')
    setGuardando('pago')
    const error = await avisarPagoDrey(espacio.id, comprobante)
    if (!error) await actualizarMisEspacios()
    setGuardando('')
    if (error) {
      setMensaje(
        error.message?.includes('Primero elegí')
          ? 'Primero elegí un plan.'
          : 'No pudimos avisar el pago. Probá de nuevo.',
      )
      return
    }
    setComprobante(null)
    mostrarAviso('¡Listo! Le avisamos a DREY.')
  }

  return (
    <ProfeLayout titulo="Suscripción DREY" volverA="/profe/mi-cuenta">
      <div className="suscripcion-plan-card">
        <p className="suscripcion-plan-nombre">
          {espacio.sinCosto
            ? 'Sin costo'
            : estado.tipo === 'prueba'
              ? 'Prueba gratis'
              : planActual?.nombre || 'Sin plan'}
        </p>
        <p className="suscripcion-plan-descripcion">{nombreDeEspacio(espacio)}</p>
        <span className={`estado-chip estado-${estado.tono}`}>{estado.texto}</span>
        <BarraCupos total={espacio.cuposTotal} usados={espacio.cuposUsados} />
        <p
          className={
            estado.tono === 'alerta'
              ? 'suscripcion-vencimiento suscripcion-vencida'
              : 'suscripcion-vencimiento'
          }
        >
          {textoEstado(estado, espacio, config.prueba)}
        </p>
      </div>

      {!espacio.sinCosto && (
        <>
          <p className="profe-seccion-label">{planActual ? 'Cambiar de plan' : 'Elegí tu plan'}</p>
          <p className="profe-nota">
            Cada plan es la cantidad de alumnos que podés tener habilitados a la vez. El plan nuevo
            empieza cuando DREY confirma tu pago.
          </p>
          <div className="lista-tarjetas">
            {opciones.map((plan) => {
              const esActual = plan.id === espacio.planDrey && !planPedido
              const esPedido = plan.id === espacio.planPedido
              return (
                <div
                  key={plan.id}
                  className={
                    esActual || esPedido ? 'plan-drey-opcion plan-drey-elegido' : 'plan-drey-opcion'
                  }
                >
                  <span className="plan-drey-textos">
                    <strong>{plan.nombre}</strong>
                    <small>
                      Hasta {plan.cupos} alumnos · {formatearPrecio(plan.precioMensual)} por mes
                      {plan.precioPrimerMes != null &&
                        ` (primer mes ${formatearPrecio(plan.precioPrimerMes)})`}
                    </small>
                    {plan.descripcion && <small>{plan.descripcion}</small>}
                    {plan.cupos < espacio.cuposUsados && (
                      <small className="plan-drey-aviso">
                        Tenés {espacio.cuposUsados} alumnos habilitados: no entran todos.
                      </small>
                    )}
                  </span>
                  {esActual ? (
                    <span className="estado-chip estado-ok">Tu plan</span>
                  ) : esPedido ? (
                    <span className="estado-chip estado-neutro">Elegido</span>
                  ) : (
                    <button
                      type="button"
                      className="boton-secundario boton-chico"
                      disabled={Boolean(guardando)}
                      onClick={() => elegir(plan.id)}
                    >
                      {guardando === plan.id ? 'Eligiendo…' : 'Elegir'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {planAPagar && (
            <>
              <p className="profe-seccion-label">Cómo pagar {planAPagar.nombre}</p>
              <div className="suscripcion-bloque">
                <p className="suscripcion-bloque-titulo">Datos para transferencia</p>
                {datosTransferencia.length > 0 ? (
                  <div className="pago-transferencia">
                    {datosTransferencia.map(([etiqueta, valor]) => (
                      <p key={etiqueta} className="suscripcion-bloque-texto">
                        <span className="pago-etiqueta">{etiqueta}:</span> {valor}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="suscripcion-bloque-texto suscripcion-pendiente">
                    DREY todavía no cargó sus datos bancarios.
                  </p>
                )}
                {linkMercadoPago && (
                  <a
                    className="pill-button"
                    href={linkMercadoPago}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Pagar con Mercado Pago
                  </a>
                )}
              </div>

              <div className="suscripcion-bloque">
                <p className="suscripcion-bloque-titulo">¿Ya pagaste?</p>
                {espacio.avisoPago ? (
                  <p className="suscripcion-bloque-texto">
                    ¡Listo! Le avisamos a DREY. Cuando confirme el pago vas a ver el vencimiento
                    nuevo acá.
                  </p>
                ) : (
                  <form className="suscripcion-form-pago" onSubmit={avisarPago}>
                    <label className="suscripcion-adjuntar">
                      {comprobante ? comprobante.name : 'Adjuntar comprobante'}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(event) => setComprobante(event.target.files?.[0] ?? null)}
                        hidden
                      />
                    </label>
                    {mensaje && <p className="auth-message">{mensaje}</p>}
                    <button type="submit" className="pill-button" disabled={Boolean(guardando)}>
                      {guardando === 'pago' ? 'Enviando…' : 'Ya pagué'}
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </>
      )}

      {pagos.length > 0 && (
        <div className="suscripcion-bloque">
          <p className="suscripcion-bloque-titulo">Tus pagos a DREY</p>
          {pagos.map((pago) => (
            <p key={pago.id} className="suscripcion-bloque-texto pago-fila">
              <span>{textoFechaCorta(pago.creado_en)}</span>
              <span>{formatearPrecio(pago.monto)}</span>
              <span className="pago-estado pago-estado-aprobado">
                {METODOS_PAGO_DREY[pago.metodo] || pago.metodo}
                {pago.periodo_hasta ? ` · hasta ${textoFechaCorta(pago.periodo_hasta)}` : ''}
              </span>
            </p>
          ))}
        </div>
      )}

      <Link to="/profe/cuentas" className="boton-texto">
        Ir a Pagos (tus alumnos)
      </Link>
    </ProfeLayout>
  )
}

function textoEstado(estado, espacio, prueba) {
  const vence = espacio.vencimiento ? textoFechaCorta(espacio.vencimiento) : ''
  switch (estado.tipo) {
    case 'sin-costo':
      return 'Tu espacio no paga suscripción a DREY.'
    case 'prueba':
      return `Podés habilitar hasta ${espacio.cuposTotal ?? prueba?.cupos ?? 3} alumnos${
        espacio.pruebaHasta ? ` hasta el ${textoFechaCorta(espacio.pruebaHasta)}` : ''
      }. Después elegí un plan para seguir sumando.`
    case 'prueba-terminada':
      return 'Terminó la prueba gratis. Elegí un plan y pagalo para seguir habilitando alumnos.'
    case 'pendiente':
      return 'Elegí un plan y pagalo para empezar a habilitar alumnos.'
    case 'pausado':
      return 'Tu espacio está pausado. Escribile a DREY.'
    case 'por-vencer':
      return `Vence el ${vence}. Pagá para no cortar.`
    case 'gracia':
      return `Venció el ${vence}. Estás en los días de gracia: pagá cuanto antes para no quedarte sin poder habilitar alumnos.`
    case 'vencido':
      return `Venció el ${vence}. Pagá para volver a habilitar alumnos.`
    default:
      return vence ? `Al día. Vence el ${vence}.` : 'Al día.'
  }
}
