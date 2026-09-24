import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { supabase } from '../services/supabaseClient.js'
import DatosDePago from '../components/DatosDePago.jsx'
import { obtenerPlan, formatearPrecio } from '../data/planes.js'

// Suscripción: plan, precio, vencimiento, datos de pago y botón "Ya
// pagué" con comprobante.
//
// El plan, el estado y el vencimiento son los reales del cliente:
// vienen de la tabla "perfiles" de Supabase (la misma que llena
// Registro y que usa el panel del profe para habilitar cuentas). Los
// datos de transferencia y los links de Mercado Pago se cargan en
// src/data/pagos.js y los muestra el componente DatosDePago.
// El comprobante que se adjunta acá
// se sube al almacenamiento de archivos de Supabase (bucket
// "comprobantes"), en una carpeta con el id del cliente para que cada
// uno solo pueda ver los suyos; el profe puede ver los de todos desde
// "Cuentas y pagos".
export default function Suscripcion() {
  const navigate = useNavigate()
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [comprobante, setComprobante] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargarPerfil()
  }, [])

  async function cargarPerfil() {
    setCargando(true)
    const { data: userData } = await supabase.auth.getUser()
    const usuario = userData?.user
    if (!usuario) {
      navigate('/')
      return
    }
    const { data } = await supabase.from('perfiles').select('*').eq('id', usuario.id).single()
    setPerfil(data)
    setCargando(false)
  }

  async function handleYaPague(event) {
    event.preventDefault()
    if (!perfil) return
    setEnviando(true)
    setMensaje('')

    let comprobantePath = perfil.comprobante_nombre || null
    if (comprobante) {
      const rutaArchivo = `${perfil.id}/${Date.now()}-${comprobante.name}`
      const { error: errorSubida } = await supabase.storage
        .from('comprobantes')
        .upload(rutaArchivo, comprobante)
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
        <p className="profe-mensaje-carga">Cargando…</p>
        <BottomNav />
      </div>
    )
  }

  const plan = obtenerPlan(perfil?.plan)
  const vencimientoTexto = perfil?.vencimiento
    ? new Date(`${perfil.vencimiento}T00:00:00`).toLocaleDateString('es-UY', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Todavía sin definir'

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
          <p className="suscripcion-vencimiento">
            {perfil?.estado === 'pendiente'
              ? 'Tu cuenta está pendiente de habilitación'
              : `Vence el ${vencimientoTexto}`}
          </p>
        </div>

        <DatosDePago planId={perfil?.plan} />

        <div className="suscripcion-bloque">
          <p className="suscripcion-bloque-titulo">¿Ya pagaste?</p>
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
      </div>
      <BottomNav />
    </div>
  )
}
