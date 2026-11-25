import { Link } from 'react-router-dom'
import IconoWhatsApp from './IconoWhatsApp.jsx'
import { textoFechaCorta } from '../../utils/dias.js'
import { textoUltimoEntreno } from '../../utils/clientes.js'

// Columna izquierda de la ficha del alumno en la compu
// (pages/ProfeClienteDetalle.jsx): lo que el profe quiere tener siempre a
// la vista mientras trabaja en las pestañas de la derecha. Lo que el
// alumno no cargó no aparece.
//   ultimoEntreno: fecha (AAAA-MM-DD) del último entrenamiento, o null.
//   diasSinEntrenar: para el texto "Hace 3 días".
export default function FichaResumen({
  cliente,
  ultimoEntreno,
  diasSinEntrenar,
  whatsapp,
  deBaja,
}) {
  const datos = [
    {
      titulo: 'Último entreno',
      valor: ultimoEntreno
        ? `${textoUltimoEntreno(diasSinEntrenar)} · ${textoFechaCorta(ultimoEntreno)}`
        : 'Todavía no entrenó',
    },
    { titulo: 'Objetivo', valor: cliente.objetivo },
    { titulo: 'Lesiones o limitaciones', valor: cliente.lesiones },
    { titulo: 'Celular', valor: cliente.celular },
  ].filter((dato) => dato.valor)

  return (
    <section className="ficha-resumen" aria-label="Resumen del alumno">
      <dl className="ficha-resumen-datos">
        {datos.map((dato) => (
          <div key={dato.titulo}>
            <dt>{dato.titulo}</dt>
            <dd>{dato.valor}</dd>
          </div>
        ))}
      </dl>
      <div className="ficha-resumen-acciones">
        {whatsapp && (
          <a href={whatsapp} className="boton-secundario" target="_blank" rel="noreferrer">
            <IconoWhatsApp />
            WhatsApp
          </a>
        )}
        {!deBaja && (
          <Link to={`/profe/mensajes?cliente=${cliente.id}`} className="boton-secundario">
            Mensaje en la app
          </Link>
        )}
      </div>
    </section>
  )
}
