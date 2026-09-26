// Tarjeta con un número del negocio ("Clientes activos: 12"). La usan
// Estadísticas y el Inicio del Admin, así se ven iguales.
export default function Numero({ etiqueta, valor, detalle, alerta }) {
  return (
    <div
      className={
        alerta ? 'dato-tarjeta estadistica estadistica-alerta' : 'dato-tarjeta estadistica'
      }
    >
      <span className="dato-etiqueta">{etiqueta}</span>
      <strong className="dato-valor">{valor}</strong>
      {detalle && <small>{detalle}</small>}
    </div>
  )
}
