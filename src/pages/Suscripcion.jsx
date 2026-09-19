import { useState } from 'react'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { obtenerPlan, formatearPrecio } from '../data/planes.js'

// Suscripción: plan, precio, vencimiento, datos de pago y botón "Ya
// pagué" con comprobante.
//
// El plan, el precio y la fecha de vencimiento de este cliente son de
// ejemplo por ahora: van a venir de su cuenta real una vez que
// conectemos Mis datos y el panel del profe. El link de Mercado Pago y
// los datos de transferencia todavía están pendientes de la Fase 0 del
// plan (el profe los tiene que crear/conseguir primero). El comprobante
// que se adjunta acá tampoco se guarda todavía: falta conectar el
// almacenamiento de archivos de Supabase.
const PLAN_EJEMPLO = obtenerPlan('seguimiento')
const VENCIMIENTO_EJEMPLO = '2026-10-15'

export default function Suscripcion() {
  const [comprobante, setComprobante] = useState(null)
  const [avisoEnviado, setAvisoEnviado] = useState(false)

  function handleYaPague(event) {
    event.preventDefault()
    setAvisoEnviado(true)
  }

  const vencimientoTexto = new Date(`${VENCIMIENTO_EJEMPLO}T00:00:00`).toLocaleDateString(
    'es-UY',
    { day: 'numeric', month: 'long', year: 'numeric' }
  )

  return (
    <div className="screen has-bottom-nav">
      <TopPattern />
      <div className="suscripcion-contenido">
        <h1 className="suscripcion-titulo">Suscripción</h1>

        <div className="suscripcion-plan-card">
          <p className="suscripcion-plan-nombre">{PLAN_EJEMPLO.nombre}</p>
          <p className="suscripcion-plan-descripcion">{PLAN_EJEMPLO.descripcion}</p>
          <p className="suscripcion-plan-precio">
            {formatearPrecio(PLAN_EJEMPLO.precioDesdeSegundoMes)} por mes
          </p>
          <p className="suscripcion-vencimiento">Vence el {vencimientoTexto}</p>
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
          {avisoEnviado ? (
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
              <button type="submit" className="pill-button">
                Ya pagué
              </button>
            </form>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
