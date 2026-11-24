import { cobroAutomatico, datosTransferencia, linkDePago } from '../data/pagos.js'
import { useConfiguracion } from '../services/configuracion.js'
import { datosParaMostrar } from '../services/cobroEspacio.js'

// Cómo pagar un plan "a mano": datos para transferencia y, mientras el
// cobro automático no esté activado, el link de Mercado Pago. Lo usan el
// Registro (paso "Pago") y la pantalla de Suscripción, así los dos
// muestran lo mismo.
//
// "cobro" son los datos de cobro del profe o gimnasio del alumno
// (services/cobroEspacio.js, supabase/sql/034). Sin "cobro" (la base
// todavía no tiene ese SQL) se usan los de Ajustes, como antes.
// El link de Mercado Pago: el del plan; si no tiene, el general del
// espacio (data/pagos.js → linkDePago).
//
// "sinCuenta" (Registro): todavía no hay cuenta creada, así que los datos
// de la cuenta bancaria no se muestran (supabase/sql/039: no se pueden
// pedir sin sesión). Se avisa que aparecen en Suscripción.
//
// Con el cobro automático activado (Ajustes del Admin) el botón de
// Mercado Pago lo muestra Suscripción (PagoMercadoPago.jsx) y acá queda
// solo la transferencia.
export default function DatosDePago({ planId, cobro, sinCuenta = false }) {
  useConfiguracion() // se vuelve a dibujar si cambian los planes
  const automatico = cobroAutomatico()
  const transferencia = sinCuenta
    ? null
    : cobro === undefined
      ? datosTransferencia()
      : datosParaMostrar(cobro)
  const linkMercadoPago = linkDePago(planId, cobro)

  return (
    <>
      {cobro?.espacio && (
        <p className="suscripcion-bloque-texto pago-a-quien">
          Le pagás a <strong>{cobro.espacio}</strong>
        </p>
      )}
      <div className="suscripcion-bloque">
        <p className="suscripcion-bloque-titulo">Datos para transferencia</p>
        {sinCuenta ? (
          <p className="suscripcion-bloque-texto">
            Por seguridad, la cuenta bancaria la ves cuando entres a la app, en Suscripción.
          </p>
        ) : transferencia ? (
          <div className="pago-transferencia">
            {Object.entries(transferencia).map(([etiqueta, valor]) => (
              <p key={etiqueta} className="suscripcion-bloque-texto">
                <span className="pago-etiqueta">{etiqueta}:</span> {valor}
              </p>
            ))}
          </div>
        ) : (
          <p className="suscripcion-bloque-texto suscripcion-pendiente">
            {cobro
              ? 'Tu profe todavía no cargó sus datos de cobro: preguntale cómo pagarle.'
              : 'Pendiente: todavía no se cargaron los datos bancarios.'}
          </p>
        )}
      </div>

      {/* Con los datos del espacio, si no tiene link no se muestra nada. */}
      {!automatico && (linkMercadoPago || cobro === undefined) && (
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
