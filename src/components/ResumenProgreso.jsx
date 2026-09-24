import GraficoProgreso from './GraficoProgreso.jsx'
import { formatearNumero, formatearCambio } from '../utils/progreso.js'

// Muestra un resumen de 4 semanas (la columna "datos" de la tabla
// resumenes_progreso). Lo usan el profe, para revisarlo antes de
// publicarlo, y el cliente en "Notificación de avance".
export default function ResumenProgreso({ resumen }) {
  const datos = resumen.datos || {}
  const ejercicios = datos.ejercicios || []

  return (
    <div className="resumen-progreso">
      <p className="resumen-periodo">
        Ciclo {resumen.ciclo} · {formatearFecha(resumen.desde)} al {formatearFecha(resumen.hasta)}
      </p>

      <div className="resumen-cifras">
        <Cifra valor={datos.entrenamientos ?? 0} etiqueta="entrenamientos" />
        <Cifra valor={datos.ejerciciosQueSubieron ?? 0} etiqueta="ejercicios con más carga" />
        <Cifra
          valor={
            datos.cambioVolumenPorcentaje == null
              ? '—'
              : `${datos.cambioVolumenPorcentaje > 0 ? '+' : ''}${datos.cambioVolumenPorcentaje}%`
          }
          etiqueta="volumen (sem. 4 vs 1)"
        />
        {datos.esfuerzoPromedio != null && (
          <Cifra
            valor={`${formatearNumero(datos.esfuerzoPromedio)}/5`}
            etiqueta="esfuerzo promedio"
          />
        )}
      </div>

      <GraficoProgreso
        tipo="barras"
        titulo="Volumen por semana (kg × reps)"
        puntos={(datos.volumenPorSemana || []).map((valor, indice) => ({
          etiqueta: `Sem ${indice + 1}`,
          valor,
        }))}
      />

      {ejercicios.length > 0 && (
        <div className="profe-tabla-wrap">
          <table className="profe-tabla resumen-tabla">
            <thead>
              <tr>
                <th>Ejercicio</th>
                <th>Inicio</th>
                <th>Final</th>
                <th>Cambio</th>
              </tr>
            </thead>
            <tbody>
              {ejercicios.map((ejercicio) => (
                <tr key={ejercicio.ejercicio_id}>
                  <td>{ejercicio.nombre}</td>
                  <td>{formatearNumero(ejercicio.kgInicio)} kg</td>
                  <td>{formatearNumero(ejercicio.kgFin)} kg</td>
                  <td
                    className={
                      ejercicio.diferenciaKg > 0
                        ? 'resumen-sube'
                        : ejercicio.diferenciaKg < 0
                          ? 'resumen-baja'
                          : ''
                    }
                  >
                    {formatearCambio(ejercicio.diferenciaKg)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resumen.comentario_profe && (
        <p className="resumen-comentario">
          <span>Tu profe:</span> {resumen.comentario_profe}
        </p>
      )}
    </div>
  )
}

function Cifra({ valor, etiqueta }) {
  return (
    <div className="resumen-cifra">
      <span className="resumen-cifra-valor">{valor}</span>
      <span className="resumen-cifra-etiqueta">{etiqueta}</span>
    </div>
  )
}

function formatearFecha(fechaISO) {
  return new Date(`${fechaISO}T00:00:00`).toLocaleDateString('es-UY', {
    day: 'numeric',
    month: 'short',
  })
}
