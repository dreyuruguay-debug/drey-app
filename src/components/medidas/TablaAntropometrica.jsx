import { CAMPOS_COMPOSICION } from '../../utils/medidas.js'
import { formatearNumero } from '../../utils/progreso.js'

// "Valoración antropométrica": las dos tablas como las arma la
// nutricionista. Arriba, una fila por fecha con el peso, el % de grasa,
// el % de masa muscular y la grasa visceral. Abajo, los pliegues (mm) con
// una columna por fecha y la suma. Si son muchas fechas, se desliza hacia
// el costado.
//   tablas: lo que devuelve tablasAntropometricas (utils/medidas.js).
export default function TablaAntropometrica({ tablas }) {
  if (!tablas) return null
  const { composicion, pliegues } = tablas
  return (
    <div className="antropometria">
      <div className="profe-tabla-wrap">
        <table className="profe-tabla antropometria-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Peso</th>
              <th>% grasa</th>
              {CAMPOS_COMPOSICION.map((campo) => (
                <th key={campo.clave}>{campo.corta}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {composicion.map((fila) => (
              <tr key={fila.id || fila.fecha}>
                <th scope="row">{fechaCompleta(fila.fecha)}</th>
                <td>{valor(fila.peso, ' kg')}</td>
                <td>{valor(fila.grasa)}</td>
                {CAMPOS_COMPOSICION.map((campo) => (
                  <td key={campo.clave}>{valor(fila[campo.clave])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pliegues && (
        <div className="profe-tabla-wrap">
          <table className="profe-tabla antropometria-tabla antropometria-pliegues">
            <thead>
              <tr>
                <th>Pliegues (mm)</th>
                {pliegues.fechas.map((fecha) => (
                  <th key={fecha.id || fecha.fecha}>{fechaCompleta(fecha.fecha)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pliegues.filas.map((fila) => (
                <tr key={fila.clave}>
                  <th scope="row">{fila.etiqueta}</th>
                  {fila.valores.map((numero, indice) => (
                    <td key={indice}>{valor(numero)}</td>
                  ))}
                </tr>
              ))}
              <tr className="antropometria-suma">
                <th scope="row">Suma</th>
                {pliegues.sumas.map((numero, indice) => (
                  <td key={indice}>{valor(numero, ' mm')}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function valor(numero, unidad = '') {
  return numero == null ? '—' : `${formatearNumero(numero)}${unidad}`
}

// "13/08/25" (con el año: la valoración junta fechas de varios años).
function fechaCompleta(fechaISO) {
  const [anio, mes, dia] = String(fechaISO).split('-')
  return `${dia}/${mes}/${anio.slice(2)}`
}
