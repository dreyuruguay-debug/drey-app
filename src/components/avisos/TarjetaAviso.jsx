import { resumenDeAQuien, resumenDeCuando } from '../../data/avisos.js'

// Una notificación en la lista del administrador
// (pages/AdminNotificaciones.jsx): nombre, cuándo sale y a quién le llega.
// Tocar el texto abre el editor; el interruptor la prende o apaga.
//
//   extras: { diasAviso, diasGracia, planes } para los textos.
export default function TarjetaAviso({ tipo, extras, onAbrir, onAlternar }) {
  return (
    <div
      className={
        tipo.activo ? 'tarjeta-rutina aviso-tarjeta' : 'tarjeta-rutina aviso-tarjeta aviso-apagado'
      }
    >
      <button type="button" className="aviso-tarjeta-textos" onClick={onAbrir}>
        <strong>
          {tipo.nombre}
          {tipo.requiere === 'mercadopago' && <span className="aviso-etiqueta">Mercado Pago</span>}
        </strong>
        <small>{resumenDeCuando(tipo, extras)}</small>
        <small className="aviso-tarjeta-quien">{resumenDeAQuien(tipo, extras.planes)}</small>
      </button>
      <button
        type="button"
        className="aviso-tarjeta-interruptor"
        role="switch"
        aria-checked={tipo.activo}
        aria-label={tipo.activo ? `Apagar "${tipo.nombre}"` : `Prender "${tipo.nombre}"`}
        onClick={onAlternar}
      >
        <span
          className={tipo.activo ? 'interruptor interruptor-on' : 'interruptor'}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
