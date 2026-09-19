import { useEffect, useState } from 'react'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { supabase } from '../services/supabaseClient.js'
import { obtenerPlan, formatearPrecio } from '../data/planes.js'

// Suscripción: plan, precio, vencimiento, datos de pago y botón "Ya
// pagué" con comprobante.
//
// El plan, el estado y el vencimiento son los reales del cliente:
// vienen de la tabla "perfiles" de Supabase (la misma que llena
// Registro y que usa el panel del profe para habilitar cuentas). El
// link de Mercado Pago y los datos de transferencia todavía están
// pendientes de la Fase 0 del plan. El comprobante que se adjunta acá
// todavía no se sube a ningún lado: por ahora solo guardamos el
// nombre del archivo para que el profe sepa que hay uno; falta
// conectar el almacenamiento de archivos de Supabase.
export default function Suscripcion() {
  const [perfil, setPerfil] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [comprobante, setComprobante] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    cargarPerfil()
  }, [])

  async function cargarPerfil() {
    setCargando(true)
    const { data: userData } = await supabase.auth.getUser()
    const usuario = userData?.user
    if (!usuario) {
      setCargando(false)
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
    const { error } = await supabase
      .from('perfiles')
      .update({ aviso_pago: true, comprobante_nombre: comprobante?.name || null })
      .eq('id', perfil.id)
    setEnviando(false)
    if (!error) {
      setPerfil((actual) => ({ ...actual, aviso_pago: true }))
    }
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

        <div className="suscripcion-bloque">
          <p className="suscripcion-bloque-titulo">Datos para transferencia</p>
          <p className="suscripcion-bloque-texto suscripcion-pendiente">
            Pendiente: el profe todavía tiene que cargar los datos bancarios.
          </p>
        </div>

        <div className="suscripcion-bloque">
          <p className="suscripcion-bloque-titulo">Mercado Pago</p>
          <button type="button" className="pill-button suscripcion-boton-desactivado" disabled>
            Link disponible próximamente
          </button>
        </div>

        <div className="suscripcion-bloque">
          <p className="suscripcion-bloque-titulo">¿Ya pagaste?</p>
          {perfil?.aviso_pago ? (
            <p className="suscripcion-bloque-texto">
              ¡Listo! Le avisamos al profe. En cuanto confirme tu pago vas a ver la fecha de
              vencimiento actualizada acá.
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
