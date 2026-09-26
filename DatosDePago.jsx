import {
  DATOS_TRANSFERENCIA,
  MERCADO_PAGO_AUTOMATICO,
  obtenerLinkMercadoPago,
} from '../data/pagos.js'

// Cómo pagar un plan "a mano": datos para transferencia y, mientras el
// cobro automático no esté activado, el link de Mercado Pago de cada
// plan. Lo usan el Registro (paso "Pago") y la pantalla de Suscripción,
// así los dos muestran exactamente lo mismo.
//
// Con MERCADO_PAGO_AUTOMATICO (data/pagos.js) el botón de Mercado Pago
// lo muestra Suscripción (PagoMercadoPago.jsx) y acá queda solo la
// transferencia.
export default function DatosDePago({ planId }) {
  const linkMercadoPago = MERCADO_PAGO_AUTOMATICO ? '' : obtenerLinkMercadoPago(planId)

  return (
    <>
      <div className="suscripcion-bloque">
        <p className="suscripcion-bloque-titulo">Datos para transferencia</p>
        {DATOS_TRANSFERENCIA ? (
          <div className="pago-transferencia">
            {Object.entries(DATOS_TRANSFERENCIA).map(([etiqueta, valor]) => (
              <p key={etiqueta} className="suscripcion-bloque-texto">
                <span className="pago-etiqueta">{etiqueta}:</span> {valor}
              </p>
            ))}
          </div>
        ) : (
          <p className="suscripcion-bloque-texto suscripcion-pendiente">
            Pendiente: el profe todavía tiene que cargar los datos bancarios.
          </p>
        )}
      </div>

      {!MERCADO_PAGO_AUTOMATICO && (
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
