import { Link } from 'react-router-dom'
import IconoWhatsApp from './IconoWhatsApp.jsx'
import { iniciales } from '../../utils/clientes.js'

// Un alumno en la lista del celular: sus iniciales con el puntito de color
// (verde al día · naranja no entrena · rojo cuota vencida), el nombre, el
// plan y lo que pasa con él, y el botón de WhatsApp a un toque.
//
// Cuando se están eligiendo alumnos para asignarles un profe ("eligiendo"),
// toda la tarjeta marca o desmarca al alumno en vez de abrir su ficha.
//   detalle:   texto de abajo del nombre (lo arma la lista).
//   situacion: { tono, texto } (utils/clientes.js).
//   whatsapp:  link para escribirle, o '' si no cargó su celular.
export default function TarjetaCliente({
  cliente,
  detalle,
  situacion,
  whatsapp,
  eligiendo,
  elegido,
  onElegir,
}) {
  const clase = [
    'cliente-tarjeta',
    situacion.tono !== 'ok' ? `cliente-tarjeta-${situacion.tono}` : '',
    elegido ? 'cliente-tarjeta-elegida' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const contenido = (
    <>
      {eligiendo && (
        <span
          className={elegido ? 'cliente-casilla cliente-casilla-marcada' : 'cliente-casilla'}
          aria-hidden="true"
        >
          {elegido ? '✓' : ''}
        </span>
      )}
      <Avatar cliente={cliente} tono={situacion.tono} />
      <span className="cliente-tarjeta-textos">
        <strong>
          {cliente.nombre} {cliente.apellido}
        </strong>
        <small>{detalle}</small>
        {situacion.tono !== 'ok' && (
          <small className={`cliente-situacion cliente-situacion-${situacion.tono}`}>
            {situacion.texto}
          </small>
        )}
      </span>
    </>
  )

  return (
    <div className={clase}>
      {eligiendo ? (
        <button
          type="button"
          className="cliente-tarjeta-principal"
          onClick={() => onElegir(cliente.id)}
          aria-pressed={elegido}
        >
          {contenido}
        </button>
      ) : (
        <Link to={`/profe/clientes/${cliente.id}`} className="cliente-tarjeta-principal">
          {contenido}
        </Link>
      )}
      {!eligiendo && whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="cliente-whatsapp"
          aria-label={`Escribirle a ${cliente.nombre} por WhatsApp`}
        >
          <IconoWhatsApp />
        </a>
      )}
    </div>
  )
}

export function Avatar({ cliente, tono }) {
  return (
    <span className="cliente-avatar" aria-hidden="true">
      {iniciales(cliente)}
      <span className={`cliente-punto cliente-punto-${tono}`} />
    </span>
  )
}
