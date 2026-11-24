import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { supabase } from '../services/supabaseClient.js'
import { obtenerUsuarioActual } from '../services/sesion.js'
import { cargarPagos, TEXTO_ESTADO_PAGO } from '../services/pagos.js'
import { cargarMiCobro } from '../services/cobroEspacio.js'
import DatosDePago from '../components/DatosDePago.jsx'
import { obtenerPlan, formatearPrecio } from '../data/planes.js'
import { useConfiguracion } from '../services/configuracion.js'
import { estadoDelPlan, textoVence } from '../data/vencimiento.js'
import { obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'
import { comprimirImagen } from '../utils/imagenes.js'
import { problemaDeComprobante } from '../utils/comprobantes.js'
import Esqueleto from '../components/Esqueleto.jsx'
import { RUTA_INGRESAR } from '../data/rutas.js'

// Suscripción: plan, estado (al día, por vencer, días de gracia,
// vencido), cómo pagar y los últimos pagos.
//
// Cómo se paga: por transferencia o con el link de Mercado Pago de su
// profe o gimnasio. Después sube el comprobante (si quiere) y toca
// "Ya pagué"; el profe lo confirma desde "Cobros".
//
// Los datos para pagar son los del profe o gimnasio del alumno (mi_cobro,
// supabase/sql/034): a ellos les paga. "Ya pagué" les avisa a ellos.
//
// El comprobante se sube al almacenamiento de Supabase (bucket
// "comprobantes"), en una carpeta con el id del cliente para que cada
// uno solo pueda ver los suyos; su profe los ve desde "Cobros".
export default function Suscripcion() {
  useConfiguracion() // planes, precios y datos de pago (Ajustes del Admin)
  const navigate = useNavigate()
  const [perfil, setPerfil] = useState(null)
  const [pagos, setPagos] = useState([])
  // Datos de cobro de su profe o gimnasio (undefined = los de Ajustes).
  const [cobro, setCobro] = useState(undefined)
  const [cargando, setCargando] = useState(true)
  const [comprobante, setComprobante] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargarPerfil()
  }, [])

  async function cargarPerfil() {
    setCargando(true)
    const usuario = await obtenerUsuarioActual()
    if (!usuario) {
      navigate(RUTA_INGRESAR)
      return
    }
    const [{ data }, listaPagos, miCobro] = await Promise.all([
      supabase.from('perfiles').select('*').eq('id', usuario.id).single(),
      cargarPagos(usuario.id),
      cargarMiCobro(),
    ])
    setPerfil(data)
    setPagos(listaPagos)
    // Sin el SQL 034 (error) quedan los datos de Ajustes, como antes.
    setCobro(miCobro.error ? undefined : miCobro.cobro || undefined)
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
      const problema = problemaDeComprobante(archivo)
      if (problema) {
        setEnviando(false)
        setMensaje(problema)
        return
      }
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

        <div className="suscripcion-plan-card">
          <p className="suscripcion-plan-nombre">{plan?.nombre || 'Sin plan'}</p>
          {plan && <p className="suscripcion-plan-descripcion">{plan.descripcion}</p>}
          {plan && (
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

        <DatosDePago planId={perfil?.plan} cobro={cobro} />

        <div className="suscripcion-bloque">
          <p className="suscripcion-bloque-titulo">¿Ya pagaste?</p>
          {perfil?.aviso_pago ? (
            <p className="suscripcion-bloque-texto">
              {perfil?.estado === 'pendiente'
                ? 'Avisaste tu pago. Esperando autorización del profesor.'
                : '¡Listo! Le avisamos a tu profe. En cuanto confirme tu pago vas a ver la fecha de vencimiento actualizada acá.'}
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
                <span>{textoFechaCorta(pago.creado_en)}</span>
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
