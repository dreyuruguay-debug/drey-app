import { Link, useNavigate } from 'react-router-dom'
import IconoWhatsApp from './IconoWhatsApp.jsx'
import { Avatar } from './TarjetaCliente.jsx'
import { textoFechaCorta } from '../../utils/dias.js'

// Alumnos en una tabla (en la compu): una fila por alumno, con columnas
// que se ordenan tocando el título (nombre, profe, último entreno,
// vencimiento). Tocando la fila se abre la ficha.
//
//   filas:        [{ cliente, plan, profe, situacion, whatsapp }]
//   orden:        { campo, ascendente }; onOrdenar(campo).
//   muestraProfe: el Admin y el dueño del gimnasio ven la columna Profe.
//   veCuota:      ven la columna Vence (quien maneja los cobros).
//   puedeElegir:  casillas para asignar un profe a varios.
export default function TablaClientes({
  filas,
  orden,
  onOrdenar,
  muestraProfe,
  veCuota,
  puedeElegir,
  elegidos,
  onElegir,
  onElegirTodos,
}) {
  const navigate = useNavigate()
  const todosElegidos = filas.length > 0 && filas.every((fila) => elegidos.has(fila.cliente.id))

  return (
    <div className="clientes-tabla-caja">
      <table className="clientes-tabla">
        <thead>
          <tr>
            {puedeElegir && (
              <th className="clientes-tabla-casilla">
                <input
                  type="checkbox"
                  checked={todosElegidos}
                  onChange={() => onElegirTodos(!todosElegidos)}
                  aria-label="Elegir todos"
                />
              </th>
            )}
            <Encabezado campo="nombre" orden={orden} onOrdenar={onOrdenar}>
              Alumno
            </Encabezado>
            <th>Plan</th>
            {muestraProfe && (
              <Encabezado campo="profe" orden={orden} onOrdenar={onOrdenar}>
                Profe
              </Encabezado>
            )}
            <Encabezado campo="entreno" orden={orden} onOrdenar={onOrdenar}>
              Último entreno
            </Encabezado>
            {veCuota && (
              <Encabezado campo="vence" orden={orden} onOrdenar={onOrdenar}>
                Vence
              </Encabezado>
            )}
            <th>Estado</th>
            <th aria-label="WhatsApp" />
          </tr>
        </thead>
        <tbody>
          {filas.map(({ cliente, plan, profe, situacion, whatsapp }) => {
            const ficha = `/profe/clientes/${cliente.id}`
            return (
              <tr
                key={cliente.id}
                className={elegidos.has(cliente.id) ? 'clientes-fila-elegida' : undefined}
                onClick={() => navigate(ficha)}
              >
                {puedeElegir && (
                  <td
                    className="clientes-tabla-casilla"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={elegidos.has(cliente.id)}
                      onChange={() => onElegir(cliente.id)}
                      aria-label={`Elegir a ${cliente.nombre}`}
                    />
                  </td>
                )}
                <td>
                  <span className="clientes-tabla-alumno">
                    <Avatar cliente={cliente} tono={situacion.tono} />
                    <Link to={ficha} onClick={(event) => event.stopPropagation()}>
                      {cliente.nombre} {cliente.apellido}
                    </Link>
                  </span>
                </td>
                <td>{plan}</td>
                {muestraProfe && <td>{profe}</td>}
                <td className="clientes-tabla-numero">{situacion.entreno}</td>
                {veCuota && (
                  <td className="clientes-tabla-numero">
                    {cliente.vencimiento ? textoFechaCorta(cliente.vencimiento) : '—'}
                  </td>
                )}
                <td>
                  <span className={`cliente-situacion cliente-situacion-${situacion.tono}`}>
                    {situacion.texto}
                  </span>
                </td>
                <td className="clientes-tabla-accion" onClick={(event) => event.stopPropagation()}>
                  {whatsapp && (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noreferrer"
                      className="cliente-whatsapp"
                      aria-label={`Escribirle a ${cliente.nombre} por WhatsApp`}
                      title="WhatsApp"
                    >
                      <IconoWhatsApp />
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Título de columna que ordena: la flechita dice hacia dónde.
function Encabezado({ campo, orden, onOrdenar, children }) {
  const activo = orden.campo === campo
  return (
    <th aria-sort={activo ? (orden.ascendente ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="clientes-tabla-orden" onClick={() => onOrdenar(campo)}>
        {children}
        <span aria-hidden="true">{activo ? (orden.ascendente ? ' ↑' : ' ↓') : ''}</span>
      </button>
    </th>
  )
}
