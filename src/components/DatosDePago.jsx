import { cobroAutomatico, datosTransferencia, obtenerLinkMercadoPago } from '../data/pagos.js'
import { useConfiguracion } from '../services/configuracion.js'

// Cómo pagar un plan "a mano": datos para transferencia y, mientras el
// cobro automático no esté activado, el link de Mercado Pago de cada
// plan. Lo usan el Registro (paso "Pago") y la pantalla de Suscripción,
// así los dos muestran exactamente lo mismo.
//
// Con el cobro automático activado (Ajustes del Admin) el botón de
// Mercado Pago lo muestra Suscripción (PagoMercadoPago.jsx) y acá queda
// solo la transferencia.
export default function DatosDePago({ planId }) {
  useConfiguracion() // se vuelve a dibujar si el Admin cambia los datos
  const automatico = cobroAutomatico()
  const transferencia = datosTransferencia()
  const linkMercadoPago = automatico ? '' : obtenerLinkMercadoPago(planId)

  return (
    <>
      <div className="suscripcion-bloque">
        <p className="suscripcion-bloque-titulo">Datos para transferencia</p>
        {transferencia ? (
          <div className="pago-transferencia">
            {Object.entries(transferencia).map(([etiqueta, valor]) => (
              <p key={etiqueta} className="suscripcion-bloque-texto">
                <span className="pago-etiqueta">{etiqueta}:</span> {valor}
              </p>
            ))}
          </div>
        ) : (
          <p className="suscripcion-bloque-texto suscripcion-pendiente">
            Pendiente: todavía no se cargaron los datos bancarios.
          </p>
        )}
      </div>

      {!automatico && (
        <div className="suscripcion-bloque">
          <p className="suscripcion-bloque-titulo">Mercado Pago</p>
          {linkMercadoPago ? (
            <a
              className="pill-button"
              href={linkMercadoPago}
              target="_blank"
              rel="noopener noreferrer"
            >
              Pagar con Mercado Pago
            </a>
          ) : (
            <button type="button" className="pill-button suscripcion-boton-desactivado" disabled>
              Link disponible próximamente
            </button>
          )}
        </div>
      )}
    </>
  )
}
