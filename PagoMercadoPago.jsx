import { useEffect, useState } from 'react'
import { consultarMiPrecio, iniciarPagoMercadoPago } from '../services/pagos.js'
import { formatearPrecio } from '../data/planes.js'

// Pagar el plan con tarjeta (Mercado Pago) desde Suscripción. Muestra
// cuánto paga este mes (primer mes o no, con su código de descuento),
// deja probar otro código y lleva a Mercado Pago. Al volver, la cuenta ya
// está activa: la activa sola la función "mp-webhook" (no el profe).
//
// onAprobado: se llama si un código cubrió el 100% (no hay nada que pagar).
export default function PagoMercadoPago({ onAprobado }) {
  const [precio, setPrecio] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [mostrarCodigo, setMostrarCodigo] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [yendo, setYendo] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    calcular(null)
  }, [])

  async function calcular(codigoNuevo) {
    setCargando(true)
    setMensaje('')
    const resultado = await consultarMiPrecio(codigoNuevo)
    setCargando(false)
    if (resultado.error) {
      setMensaje(resultado.error)
      return
    }
    setPrecio(resultado)
    if (resultado.mensaje_codigo) setMensaje(resultado.mensaje_codigo)
  }

  async function pagar() {
    setYendo(true)
    setMensaje('')
    const resultado = await iniciarPagoMercadoPago(precio?.codigo || codigo)
    if (resultado.url) {
      window.location.assign(resultado.url)
      return
    }
    setYendo(false)
    if (resultado.aprobado) {
      onAprobado?.()
      return
    }
    setMensaje(resultado.error || 'No pudimos conectar con Mercado Pago.')
  }

  return (
    <div className="suscripcion-bloque pago-mp">
      <p className="suscripcion-bloque-titulo">Pagar con tarjeta o Mercado Pago</p>

      {cargando && !precio ? (
        <p className="suscripcion-bloque-texto">Calculando…</p>
      ) : precio ? (
        <div className="pago-mp-precio">
          <span>
            {precio.plan_nombre}
            {precio.primer_mes ? ' · primer mes' : ' · 1 mes'}
          </span>
          {precio.descuento > 0 && (
            <span className="pago-mp-tachado">{formatearPrecio(precio.monto_base)}</span>
          )}
          <strong>{formatearPrecio(precio.monto)}</strong>
          {precio.codigo && (
            <small className="pago-mp-codigo">
              Código {precio.codigo}: −{formatearPrecio(precio.descuento)}
            </small>
          )}
        </div>
      ) : null}

      {mostrarCodigo ? (
        <form
          className="pago-mp-form-codigo"
          onSubmit={(event) => {
            event.preventDefault()
            calcular(codigo)
          }}
        >
          <input
            className="auth-input"
            type="text"
            placeholder="Código de descuento"
            value={codigo}
            onChange={(event) => setCodigo(event.target.value.toUpperCase())}
          />
          <button type="submit" className="boton-secundario boton-chico" disabled={cargando}>
            Aplicar
          </button>
        </form>
      ) : (
        <button type="button" className="boton-texto" onClick={() => setMostrarCodigo(true)}>
          Tengo un código de descuento
        </button>
      )}

      {mensaje && <p className="auth-message">{mensaje}</p>}

      <button
        type="button"
        className="boton-principal"
        onClick={pagar}
        disabled={!precio || yendo || cargando}
      >
        {yendo
          ? 'Abriendo Mercado Pago…'
          : precio?.monto === 0
            ? 'Activar sin costo'
            : `Pagar ${precio ? formatearPrecio(precio.monto) : ''}`}
      </button>
      <p className="suscripcion-bloque-texto pago-mp-nota">
        Se activa al instante, sin esperar al profe. Podés pagar con tarjeta de crédito, débito o tu
        cuenta de Mercado Pago.
      </p>
    </div>
  )
}
