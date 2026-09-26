import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { supabase } from '../services/supabaseClient.js'
import { obtenerUsuarioActual } from '../services/sesion.js'
import { cargarPagos, TEXTO_ESTADO_PAGO } from '../services/pagos.js'
import DatosDePago from '../components/DatosDePago.jsx'
import PagoMercadoPago from '../components/PagoMercadoPago.jsx'
import { obtenerPlan, formatearPrecio } from '../data/planes.js'
import { MERCADO_PAGO_AUTOMATICO } from '../data/pagos.js'
import { estadoDelPlan, textoVence } from '../data/vencimiento.js'
import { obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'
import { comprimirImagen } from '../utils/imagenes.js'
import Esqueleto from '../components/Esqueleto.jsx'

const REVISAR_PAGO_CADA_MS = 3000
const REVISAR_PAGO_VECES = 10

// Suscripción: plan, estado (al día, por vencer, días de gracia,
// vencido), cómo pagar y los últimos pagos.
//
// Dos formas de pagar:
//   1. Mercado Pago automático (si está activado en data/pagos.js): paga
//      con tarjeta y la cuenta se activa sola al instante.
//   2. Transferencia: ve los datos, sube el comprobante y toca "Ya pagué";
//      el profe lo confirma desde "Pagos".
//
// Al volver de Mercado Pago la dirección trae ?pago=ok / pendiente /
// error. Con "ok", la pantalla revisa unos segundos hasta ver la cuenta
// actualizada (Mercado Pago avisa a la base casi al instante).
//
// El comprobante se sube al almacenamiento de Supabase (bucket
// "comprobantes"), en una carpeta con el id del cliente para que cada
// uno solo pueda ver los suyos; su profe los ve desde "Pagos".
export default function Suscripcion() {
  const navigate = useNavigate()
  const [parametros, setParametros] = useSearchParams()
  const [perfil, setPerfil] = useState(null)
  const [pagos, setPagos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [comprobante, setComprobante] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [vueltaDePago, setVueltaDePago] = useState(() => parametros.get('pago'))
  const revisiones = useRef(0)

  useEffect(() => {
    cargarPerfil()
    // Se limpia la dirección para que un "recargar" no repita el aviso.
    if (parametros.get('pago')) setParametros({}, { replace: true })
  }, [])

  // Volvió de pagar: se revisa cada 3 segundos hasta ver el pago aprobado.
  useEffect(() => {
    if (vueltaDePago !== 'ok' || !perfil) return undefined
    if (pagos[0]?.estado === 'aprobado' && pagoReciente(pagos[0])) {
      setVueltaDePago('aprobado')
      return undefined
    }
    if (revisiones.current >= REVISAR_PAGO_VECES) return undefined
    const temporizador = setTimeout(() => {
      revisiones.current += 1
      cargarPerfil({ silencioso: true })
    }, REVISAR_PAGO_CADA_MS)
    return () => clearTimeout(temporizador)
  }, [vueltaDePago, perfil, pagos])

  async function cargarPerfil({ silencioso = false } = {}) {
    if (!silencioso) setCargando(true)
    const usuario = await obtenerUsuarioActual()
    if (!usuario) {
      navigate('/')
      return
    }
    const [{ data }, listaPagos] = await Promise.all([
      supabase.from('perfiles').select('*').eq('id', usuario.id).single(),
      cargarPagos(usuario.id),
    ])
    setPerfil(data)
    setPagos(listaPagos)
    setCargando(false)
  }

  async function handleYaPague(event) {
    event.preventDefault()
    if (!perfil) return
    setEnviando(true)
    setMensaje('')

    let comprobantePath = perfil.comprobante_nombre || null
    if (comprobante) {
      const archivo = await comprimirImagen(comprobante, 1600)
      const rutaArchivo = `${perfil.id}/${Date.now()}-${archivo.name.replace(/[^\w.-]/g, '_')}`
      const { error: errorSubida } = await supabase.storage
        .from('comprobantes')
        .upload(rutaArchivo, archivo)
      if (errorSubida) {
        setEnviando(false)
        setMensaje('No pudimos subir el comprobante. Probá de nuevo.')
        return
      }
      comprobantePath = rutaArchivo
    }

    const { error } = await supabase
      .from('perfiles')
      .update({ aviso_pago: true, comprobante_nombre: comprobantePath })
      .eq('id', perfil.id)
    setEnviando(false)
    if (error) {
      setMensaje('No pudimos avisar el pago. Probá de nuevo.')
      return
    }
    setPerfil((actual) => ({ ...actual, aviso_pago: true, comprobante_nombre: comprobantePath }))
  }

  if (cargando) {
    return (
      <div className="screen has-bottom-nav">
        <TopPattern />
        <Esqueleto filas={3} />
        <BottomNav />
      </div>
    )
  }

  const plan = obtenerPlan(perfil?.plan)
  const estado = estadoDelPlan(perfil, obtenerFechaHoyISO())

  return (
    <div className="screen has-bottom-nav">
      <TopPattern />
      <div className="suscripcion-contenido">
        <Link to="/perfil" className="volver-enlace">
          ← Perfil
        </Link>
        <h1 className="suscripcion-titulo">Suscripción</h1>

        <AvisoVueltaDePago estado={vueltaDePago} />

        <div className="suscripcion-plan-card">
          <p className="suscripcion-plan-nombre">{plan?.nombre || 'Sin plan'}</p>
          {plan && <p className="suscripcion-plan-descripcion">{plan.descripcion}</p>}
          {plan && !MERCADO_PAGO_AUTOMATICO && (
            <p className="suscripcion-plan-precio">
              {formatearPrecio(plan.precioDesdeSegundoMes)} por mes
            </p>
          )}
          <p
            className={
              ['gracia', 'vencido'].includes(estado.tipo)
                ? 'suscripcion-vencimiento suscripcion-vencida'
                : 'suscripcion-vencimiento'
            }
          >
            {textoEstado(estado, perfil)}
          </p>
        </div>

        {MERCADO_PAGO_AUTOMATICO && perfil && (
          <PagoMercadoPago onAprobado={() => cargarPerfil({ silencioso: true })} />
        )}

        {MERCADO_PAGO_AUTOMATICO && (
          <p className="seccion-etiqueta suscripcion-otra-forma">O por transferencia</p>
        )}

        <DatosDePago planId={perfil?.plan} />

        <div className="suscripcion-bloque">
          <p className="suscripcion-bloque-titulo">¿Ya pagaste por transferencia?</p>
          {perfil?.aviso_pago ? (
            <p className="suscripcion-bloque-texto">
              {perfil?.estado === 'pendiente'
                ? 'Avisaste tu pago. Esperando autorización del profesor.'
                : '¡Listo! Le avisamos al profe. En cuanto confirme tu pago vas a ver la fecha de vencimiento actualizada acá.'}
            </p>
          ) : (
            <form className="suscripcion-form-pago" onSubmit={handleYaPague}>
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
              <button type="submit" className="pill-button" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Ya pagué'}
              </button>
            </form>
          )}
        </div>

        {pagos.length > 0 && (
          <div className="suscripcion-bloque">
            <p className="suscripcion-bloque-titulo">Tus pagos</p>
            {pagos.map((pago) => (
              <p key={pago.id} className="suscripcion-bloque-texto pago-fila">
                <span>{textoFechaCorta(pago.creado_en.slice(0, 10))}</span>
                <span>{formatearPrecio(pago.monto)}</span>
                <span className={`pago-estado pago-estado-${pago.estado}`}>
                  {TEXTO_ESTADO_PAGO[pago.estado] || pago.estado}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  )
}

function textoEstado(estado, perfil) {
  const vence = perfil?.vencimiento ? textoFechaCorta(perfil.vencimiento) : ''
  switch (estado.tipo) {
    case 'pendiente':
      return 'Tu cuenta está pendiente: se activa cuando se confirma el pago.'
    case 'por-vencer':
      return `Tu plan ${textoVence(estado.dias)} (${vence}).`
    case 'gracia':
      return `Venció el ${vence}. Tenés hasta el ${textoFechaCorta(estado.hasta)} para pagar sin perder el acceso.`
    case 'vencido':
      return `Venció el ${vence}. Pagá para volver a ver tus rutinas.`
    default:
      return vence ? `Al día. Vence el ${vence}.` : 'Al día.'
  }
}

function pagoReciente(pago) {
  return Date.now() - new Date(pago.aprobado_en || pago.creado_en).getTime() < 30 * 60 * 1000
}

function AvisoVueltaDePago({ estado }) {
  if (!estado) return null
  const textos = {
    ok: ['Procesando tu pago…', 'Mercado Pago nos está avisando. Tarda unos segundos.'],
    aprobado: ['¡Pago aprobado!', 'Tu plan ya está activo. Gracias.'],
    pendiente: [
      'Tu pago está pendiente',
      'Si pagaste en efectivo (Abitab, Redpagos), tu plan se activa solo cuando se acredite.',
    ],
    error: ['El pago no se completó', 'No se cobró nada. Podés probar de nuevo.'],
  }
  const [titulo, texto] = textos[estado] || textos.error
  return (
    <div className={`aviso-pago aviso-pago-${estado}`} role="status">
      <strong>{titulo}</strong>
      <span>{texto}</span>
    </div>
  )
}
