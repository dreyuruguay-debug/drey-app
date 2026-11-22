import { Cifra, textoCambioMedida, textoPorcentaje, claseSigno } from './EvaluacionMensual.jsx'
import { GraficoMejoras, GraficoMeses } from './GraficosEvaluacion.jsx'
import { COLORES_APP, COLORES_PDF } from './colores.js'
import { formatearNumero, formatearPeso } from '../../utils/progreso.js'
import { textoSerie } from '../../utils/evaluacion.js'
import { esEvaluacionAnual, mejoresDelAnio } from '../../utils/evaluacionAnual.js'

// EVALUACIÓN DEL AÑO: la plantilla que ven el profe (al revisarla), el
// alumno (Progreso → Evaluación del año) y la que va al PDF. Recibe una
// fila de la tabla evaluaciones_anuales (o una igual armada en el
// momento, para la vista previa del profe): { anio, datos,
// comentario_profe, objetivos }. Los números los arma
// utils/evaluacionAnual.js.
//
// Partes, en orden:
//   cabecera · lo más destacado · el año en números · entrenamientos por
//   mes · los ejercicios que más mejoraron · TODOS los ejercicios (cómo
//   empezó y cómo terminó, fuerza estimada, serie de más tonelaje) ·
//   medidas y valoración antropométrica (inicio y fin del año) ·
//   comentario del profe y objetivos para el año que viene.
//
// paraPdf: versión para el PDF (fondo blanco, cabecera negra con el logo
// y colores fijos). Cada parte lleva data-bloque: el PDF arma las hojas
// de a partes enteras (services/pdfEvaluacion.js).
export default function EvaluacionAnual({ resumen, nombreAlumno, nombreProfe, paraPdf = false }) {
  const datos = resumen?.datos || {}
  if (!esEvaluacionAnual(datos)) {
    return <p className="profe-vacio">Esta evaluación todavía no tiene datos.</p>
  }
  const colores = paraPdf ? COLORES_PDF : COLORES_APP
  const comentario = String(resumen.comentario_profe || '').trim()
  const objetivos = String(resumen.objetivos || '').trim()
  const mejores = mejoresDelAnio(datos)
  const ejercicios = datos.ejercicios || []

  return (
    <article className={paraPdf ? 'evaluacion evaluacion-pdf' : 'evaluacion'}>
      <header className="evaluacion-cabecera" data-bloque>
        {paraPdf && <img src="/drey-logo.png" alt="DREY" className="evaluacion-logo" />}
        <div className="evaluacion-cabecera-textos">
          <p className="evaluacion-sobretitulo">Evaluación del año {datos.anio}</p>
          {nombreAlumno && <h2 className="evaluacion-alumno">{nombreAlumno}</h2>}
          <p className="evaluacion-periodo">
            {textoFecha(datos.desde)} al {textoFecha(datos.hasta)}
            {datos.completo ? '' : ' (el año todavía no terminó)'}
            {nombreProfe ? ` · Profe: ${nombreProfe}` : ''}
          </p>
        </div>
      </header>

      {datos.destacados?.length > 0 && (
        <section className="evaluacion-bloque" data-bloque>
          <h3 className="evaluacion-titulo">Lo más destacado del año</h3>
          <ul className="evaluacion-destacados">
            {datos.destacados.map((frase) => (
              <li key={frase}>{frase}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="evaluacion-bloque" data-bloque>
        <h3 className="evaluacion-titulo">El año en números</h3>
        <div className="evaluacion-cifras">
          <Cifra valor={datos.entrenamientos} etiqueta="entrenamientos" />
          <Cifra valor={datos.semanasEntrenadas} etiqueta="semanas entrenadas" />
          <Cifra valor={datos.mejorRacha} etiqueta="semanas seguidas (mejor racha)" />
          <Cifra valor={`${datos.mesesEntrenados}/12`} etiqueta="meses con entrenamientos" />
          <Cifra
            valor={`${formatearNumero(datos.volumenTotal)} kg`}
            etiqueta="volumen total (kg × reps)"
          />
          <Cifra valor={formatearNumero(datos.seriesTotales)} etiqueta="series efectivas" />
          <Cifra valor={formatearNumero(datos.repsTotales)} etiqueta="repeticiones" />
          {datos.horas > 0 && (
            <Cifra valor={`${formatearNumero(datos.horas)} h`} etiqueta="entrenando (con tiempo anotado)" />
          )}
          <Cifra valor={datos.ejerciciosDistintos} etiqueta="ejercicios distintos" />
          <Cifra
            valor={`${datos.ejerciciosQueMejoraron}/${datos.ejerciciosComparables}`}
            etiqueta="ejercicios que mejoraron"
          />
          <Cifra valor={datos.records} etiqueta="récords personales de peso" />
          {datos.esfuerzoPromedio != null && (
            <Cifra
              valor={`${formatearNumero(datos.esfuerzoPromedio)}/5`}
              etiqueta="exigencia promedio"
            />
          )}
        </div>
      </section>

      <section className="evaluacion-bloque" data-bloque>
        <h3 className="evaluacion-titulo">Entrenamientos por mes</h3>
        <GraficoMeses meses={datos.meses} colores={colores} />
        {datos.mesMasActivo && (
          <p className="evaluacion-aclaracion">Mes más activo: {datos.mesMasActivo}.</p>
        )}
      </section>

      {mejores.length > 0 && (
        <section className="evaluacion-bloque" data-bloque>
          <h3 className="evaluacion-titulo">Los ejercicios que más mejoraron</h3>
          <p className="evaluacion-aclaracion">
            La última vez del año contra la primera. Con peso, la fuerza estimada (1RM); sin peso o
            por tiempo, las repeticiones o los segundos.
          </p>
          <GraficoMejoras filas={mejores} colores={colores} />
        </section>
      )}

      {ejercicios.length > 0 && (
        <section className="evaluacion-bloque" data-bloque>
          <h3 className="evaluacion-titulo">Todos los ejercicios ({ejercicios.length})</h3>
          <div className="profe-tabla-wrap">
            <table className="profe-tabla evaluacion-tabla evaluacion-anual-tabla">
              <thead>
                <tr>
                  <th>Ejercicio</th>
                  <th>Veces</th>
                  <th>Empezó → terminó</th>
                  <th>Mejora</th>
                  <th>Serie de más tonelaje</th>
                </tr>
              </thead>
              <tbody>
                {ejercicios.map((ejercicio) => (
                  <tr key={ejercicio.ejercicio_id}>
                    <td>
                      <strong>{ejercicio.nombre}</strong>
                      {ejercicio.record && <span className="evaluacion-record">Récord</span>}
                    </td>
                    <td>{ejercicio.veces}</td>
                    <td>
                      {ejercicio.veces > 1
                        ? `${textoSerie(ejercicio.serieInicio, ejercicio.porTiempo)} → ${textoSerie(ejercicio.serieFin, ejercicio.porTiempo)}`
                        : textoSerie(ejercicio.serieFin, ejercicio.porTiempo)}
                    </td>
                    <td className={claseSigno(ejercicio.mejoraPct, 'evaluacion-dato-cambio')}>
                      {textoPorcentaje(ejercicio.mejoraPct) || '—'}
                    </td>
                    <td>
                      {ejercicio.mejorTonelaje
                        ? `${formatearNumero(ejercicio.mejorTonelaje.total)} kg (${formatearPeso(ejercicio.mejorTonelaje.kg)} × ${ejercicio.mejorTonelaje.reps})`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {datos.medidas && (
        <section className="evaluacion-bloque" data-bloque>
          <h3 className="evaluacion-titulo">Medidas y valoración antropométrica</h3>
          <div className="profe-tabla-wrap">
            <table className="profe-tabla evaluacion-tabla">
              <thead>
                <tr>
                  <th>Medida</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th>Cambio</th>
                </tr>
              </thead>
              <tbody>
                {datos.medidas.campos.map((campo) => (
                  <tr key={campo.clave}>
                    <td>{campo.etiqueta}</td>
                    <td>
                      {campo.inicio == null
                        ? '—'
                        : `${formatearNumero(campo.inicio)} ${campo.unidad}`}
                    </td>
                    <td>
                      <strong>
                        {formatearNumero(campo.fin)} {campo.unidad}
                      </strong>
                    </td>
                    <td>{textoCambioMedida(campo.cambio, campo.unidad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="evaluacion-aclaracion">
            Inicio: la última medición de antes del año (o la primera del año). Fin: la última del
            año.
          </p>
        </section>
      )}

      {(comentario || objetivos) && (
        <section className="evaluacion-bloque evaluacion-profe" data-bloque>
          {comentario && (
            <>
              <h3 className="evaluacion-titulo">Comentario de tu profe</h3>
              <p className="evaluacion-texto-profe">{comentario}</p>
            </>
          )}
          {objetivos && (
            <>
              <h3 className="evaluacion-titulo">Objetivos para el año que viene</h3>
              <p className="evaluacion-texto-profe">{objetivos}</p>
            </>
          )}
        </section>
      )}

      <footer className="evaluacion-pie" data-bloque>
        Cómo se compara: cada ejercicio, la primera vez que lo hiciste en el año contra la última.
        1RM estimado = peso × (1 + repeticiones / 30). Tonelaje de la serie = kilos × repeticiones
        de una serie. Solo cuentan las series efectivas marcadas como hechas.
      </footer>
    </article>
  )
}

function textoFecha(fechaISO) {
  if (!fechaISO) return ''
  return new Date(`${fechaISO}T00:00:00`).toLocaleDateString('es-UY', {
    day: 'numeric',
    month: 'long',
  })
}
