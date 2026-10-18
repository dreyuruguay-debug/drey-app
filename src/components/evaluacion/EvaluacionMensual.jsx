import ResumenProgreso from '../ResumenProgreso.jsx'
import { GraficoMejoras, GraficoSemanas, MiniLinea } from './GraficosEvaluacion.jsx'
import { COLORES_APP, COLORES_PDF } from './colores.js'
import { formatearNumero, formatearPeso } from '../../utils/progreso.js'
import { esEvaluacionCompleta, notasLimpias, textoSerie } from '../../utils/evaluacion.js'

// EVALUACIÓN MENSUAL: la plantilla que ven el profe (al revisarla), el
// alumno (Progreso → Evaluaciones) y la que va al PDF / Google Drive.
// Recibe una fila de la tabla resumenes_progreso (o una igual armada en
// el momento, para la vista previa del profe).
//
// Partes, en orden:
//   cabecera · lo más destacado · el mes en números · volumen por
//   semana · mejora por ejercicio · TODOS los ejercicios (inicio →
//   ahora, carga, 1RM estimado, volumen, mini gráfica y nota del profe) ·
//   medidas (solo si el profe las incluyó) · comentario y objetivos.
//
// paraPdf: versión para el PDF (fondo blanco, cabecera negra con el logo
// y colores fijos). Cada parte lleva data-bloque: el PDF arma las hojas
// de a partes enteras, sin cortar ninguna por la mitad.
//
// Las evaluaciones del formato anterior (antes del SQL 031) se muestran
// con el resumen de antes.
export default function EvaluacionMensual({ resumen, nombreAlumno, nombreProfe, paraPdf = false }) {
  const datos = resumen?.datos || {}
  if (!esEvaluacionCompleta(datos)) return <ResumenProgreso resumen={resumen} />

  const colores = paraPdf ? COLORES_PDF : COLORES_APP
  const notas = notasLimpias(resumen.notas)
  const comentario = String(resumen.comentario_profe || '').trim()
  const ejercicios = datos.ejercicios || []
  const comparables = ejercicios.filter((e) => e.mejoraPct != null)
  const medidas = resumen.incluir_medidas ? datos.medidas : null
  const mesAnterior = datos.mesAnterior
  const promedioAnterior = mesAnterior ? mesAnterior.volumen / 4 : null

  return (
    <article className={paraPdf ? 'evaluacion evaluacion-pdf' : 'evaluacion'}>
      <header className="evaluacion-cabecera" data-bloque>
        {paraPdf && <img src="/drey-logo.png" alt="DREY" className="evaluacion-logo" />}
        <div className="evaluacion-cabecera-textos">
          <p className="evaluacion-sobretitulo">Evaluación mensual · Ciclo {resumen.ciclo}</p>
          {nombreAlumno && <h2 className="evaluacion-alumno">{nombreAlumno}</h2>}
          <p className="evaluacion-periodo">
            {textoFecha(datos.desde)} al {textoFecha(datos.hasta)}
            {nombreProfe ? ` · Profe: ${nombreProfe}` : ''}
          </p>
        </div>
      </header>

      {(datos.destacados?.length > 0 || notas.destacado) && (
        <section className="evaluacion-bloque" data-bloque>
          <h3 className="evaluacion-titulo">Lo más destacado del mes</h3>
          <ul className="evaluacion-destacados">
            {(datos.destacados || []).map((frase) => (
              <li key={frase}>{frase}</li>
            ))}
          </ul>
          {notas.destacado && (
            <p className="evaluacion-nota-profe">
              <span>Tu profe destaca:</span> {notas.destacado}
            </p>
          )}
        </section>
      )}

      <section className="evaluacion-bloque" data-bloque>
        <h3 className="evaluacion-titulo">El mes en números</h3>
        <div className="evaluacion-cifras">
          <Cifra
            valor={datos.entrenamientos}
            etiqueta="entrenamientos"
            cambio={textoDiferencia(datos.cambioEntrenamientos)}
            signo={datos.cambioEntrenamientos}
          />
          <Cifra
            valor={`${formatearNumero(datos.volumenTotal)} kg`}
            etiqueta="volumen total (kg × reps)"
            cambio={textoPorcentaje(datos.cambioVolumenPct)}
            signo={datos.cambioVolumenPct}
          />
          <Cifra
            valor={datos.seriesTotales}
            etiqueta="series efectivas"
            cambio={textoPorcentaje(datos.cambioSeriesPct)}
            signo={datos.cambioSeriesPct}
          />
          <Cifra
            valor={formatearNumero(datos.repsTotales)}
            etiqueta="repeticiones"
            cambio={textoPorcentaje(datos.cambioRepsPct)}
            signo={datos.cambioRepsPct}
          />
          <Cifra
            valor={`${datos.ejerciciosQueSubieron}/${ejercicios.length - datos.ejerciciosNuevos}`}
            etiqueta="ejercicios que mejoraron"
          />
          <Cifra valor={datos.records} etiqueta="récords personales" />
          <Cifra valor={`${datos.semanasEntrenadas}/4`} etiqueta="semanas entrenadas" />
          {datos.esfuerzoPromedio != null && (
            <Cifra
              valor={`${formatearNumero(datos.esfuerzoPromedio)}/5`}
              etiqueta="esfuerzo promedio"
            />
          )}
        </div>
        {mesAnterior ? (
          <p className="evaluacion-aclaracion">
            Las flechas comparan con el mes anterior ({mesAnterior.entrenamientos} entrenamientos,{' '}
            {formatearNumero(mesAnterior.volumen)} kg).
          </p>
        ) : (
          <p className="evaluacion-aclaracion">Es tu primer mes: el próximo se compara con este.</p>
        )}
      </section>

      <section className="evaluacion-bloque" data-bloque>
        <h3 className="evaluacion-titulo">Volumen por semana</h3>
        <p className="evaluacion-aclaracion">
          Kilos levantados en la semana (peso × repeticiones de las series efectivas).
        </p>
        <GraficoSemanas
          semanas={datos.semanas}
          promedioAnterior={promedioAnterior}
          colores={colores}
        />
        {promedioAnterior > 0 && (
          <p className="evaluacion-aclaracion evaluacion-referencia">
            <span aria-hidden="true">- - -</span> Promedio por semana del mes anterior:{' '}
            {formatearNumero(Math.round(promedioAnterior))} kg
          </p>
        )}
      </section>

      {comparables.length > 0 && (
        <section className="evaluacion-bloque" data-bloque>
          <h3 className="evaluacion-titulo">Mejora por ejercicio</h3>
          <p className="evaluacion-aclaracion">
            Fuerza estimada (1RM) al terminar el mes contra el inicio. En los ejercicios con el peso
            del cuerpo, las repeticiones.
          </p>
          <GraficoMejoras
            filas={comparables.map((e) => ({ nombre: e.nombre, valor: e.mejoraPct }))}
            colores={colores}
          />
        </section>
      )}

      <section className="evaluacion-ejercicios">
        <h3 className="evaluacion-titulo" data-bloque>
          Todos los ejercicios ({ejercicios.length})
        </h3>
        {ejercicios.map((ejercicio) => (
          <TarjetaEjercicio
            key={ejercicio.ejercicio_id}
            ejercicio={ejercicio}
            nota={notas.ejercicios[ejercicio.ejercicio_id]}
            colores={colores}
          />
        ))}
      </section>

      {medidas && <SeccionMedidas medidas={medidas} />}

      {(comentario || notas.objetivos) && (
        <section className="evaluacion-bloque evaluacion-profe" data-bloque>
          {comentario && (
            <>
              <h3 className="evaluacion-titulo">Comentario de tu profe</h3>
              <p className="evaluacion-texto-profe">{comentario}</p>
            </>
          )}
          {notas.objetivos && (
            <>
              <h3 className="evaluacion-titulo">Objetivos para el mes que viene</h3>
              <p className="evaluacion-texto-profe">{notas.objetivos}</p>
            </>
          )}
        </section>
      )}

      <footer className="evaluacion-pie" data-bloque>
        Cómo se compara: el inicio de cada ejercicio es la última vez que lo hiciste antes de este
        mes (o la primera dentro del mes, si es nuevo); "ahora" es la última vez del mes. 1RM
        estimado = peso × (1 + repeticiones / 30). Solo cuentan las series efectivas marcadas como
        hechas (no las de calentamiento).
      </footer>
    </article>
  )
}

const ETIQUETA_ESTADO = {
  sube: 'Mejoró',
  igual: 'Se mantuvo',
  baja: 'Bajó',
  nuevo: 'Nuevo',
}

function TarjetaEjercicio({ ejercicio, nota, colores }) {
  const conPeso = ejercicio.puntos.some((punto) => punto.kg > 0)
  const valores = ejercicio.puntos.map((punto) => (conPeso ? punto.kg : punto.reps))
  const comparable = ejercicio.estado !== 'nuevo'
  return (
    <div className={`evaluacion-ejercicio evaluacion-ejercicio-${ejercicio.estado}`} data-bloque>
      <div className="evaluacion-ejercicio-cabecera">
        <strong className="evaluacion-ejercicio-nombre">
          {ejercicio.nombre}
          {ejercicio.record && <span className="evaluacion-record">Récord</span>}
        </strong>
        <span className={`evaluacion-estado evaluacion-estado-${ejercicio.estado}`}>
          {ETIQUETA_ESTADO[ejercicio.estado]}
        </span>
      </div>
      <p className="evaluacion-ejercicio-texto">{ejercicio.texto}</p>

      <div className="evaluacion-ejercicio-cuerpo">
        <dl className="evaluacion-datos">
          <Dato
            etiqueta="Mejor serie"
            valor={
              comparable
                ? `${textoSerie(ejercicio.serieInicio)} → ${textoSerie(ejercicio.serieFin)}`
                : textoSerie(ejercicio.serieFin)
            }
          />
          {conPeso && (
            <Dato
              etiqueta="1RM estimado"
              valor={
                comparable
                  ? `${formatearPeso(ejercicio.rmInicio)} → ${formatearPeso(ejercicio.rmFin)} kg`
                  : `${formatearPeso(ejercicio.rmFin)} kg`
              }
              cambio={comparable ? textoPorcentaje(ejercicio.rmCambioPct) : ''}
              signo={ejercicio.rmCambioPct}
            />
          )}
          {conPeso && (
            <Dato
              etiqueta="Volumen por sesión"
              valor={
                comparable
                  ? `${formatearNumero(ejercicio.volumenInicio)} → ${formatearNumero(ejercicio.volumenFin)} kg`
                  : `${formatearNumero(ejercicio.volumenFin)} kg`
              }
              cambio={comparable ? textoPorcentaje(ejercicio.volumenCambioPct) : ''}
              signo={ejercicio.volumenCambioPct}
            />
          )}
          <Dato
            etiqueta="En el mes"
            valor={`${ejercicio.veces} ${ejercicio.veces === 1 ? 'vez' : 'veces'} · ${ejercicio.seriesMes} series · ${ejercicio.repsMes} reps${conPeso ? ` · ${formatearNumero(ejercicio.volumenMes)} kg` : ''}`}
          />
        </dl>
        {valores.length > 1 && (
          <div className="evaluacion-mini-caja">
            <MiniLinea valores={valores} colores={colores} />
            <small>{conPeso ? 'kg por sesión' : 'reps por sesión'}</small>
          </div>
        )}
      </div>

      {nota && (
        <p className="evaluacion-nota-profe">
          <span>Tu profe:</span> {nota}
        </p>
      )}
    </div>
  )
}

function SeccionMedidas({ medidas }) {
  return (
    <section className="evaluacion-bloque" data-bloque>
      <h3 className="evaluacion-titulo">Medidas corporales</h3>
      <div className="profe-tabla-wrap">
        <table className="profe-tabla evaluacion-tabla">
          <thead>
            <tr>
              <th>Medida</th>
              <th>Inicio del mes</th>
              <th>Ahora</th>
              <th>Cambio</th>
              <th>Desde el principio</th>
            </tr>
          </thead>
          <tbody>
            {medidas.campos.map((campo) => (
              <tr key={campo.clave}>
                <td>{campo.etiqueta}</td>
                <td>
                  {campo.inicio == null ? '—' : `${formatearNumero(campo.inicio)} ${campo.unidad}`}
                </td>
                <td>
                  <strong>
                    {formatearNumero(campo.fin)} {campo.unidad}
                  </strong>
                </td>
                <td>{textoCambioMedida(campo.cambio, campo.unidad)}</td>
                <td>{textoCambioMedida(campo.cambioTotal, campo.unidad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {medidas.imc && (
        <p className="evaluacion-aclaracion">IMC actual: {formatearNumero(medidas.imc)}</p>
      )}
    </section>
  )
}

function Cifra({ valor, etiqueta, cambio, signo }) {
  return (
    <div className="evaluacion-cifra">
      <span className="evaluacion-cifra-valor">{valor}</span>
      <span className="evaluacion-cifra-etiqueta">{etiqueta}</span>
      {cambio && <span className={claseSigno(signo, 'evaluacion-cifra-cambio')}>{cambio}</span>}
    </div>
  )
}

function Dato({ etiqueta, valor, cambio, signo }) {
  return (
    <div className="evaluacion-dato">
      <dt>{etiqueta}</dt>
      <dd>
        {valor}
        {cambio && <span className={claseSigno(signo, 'evaluacion-dato-cambio')}> {cambio}</span>}
      </dd>
    </div>
  )
}

function claseSigno(signo, base) {
  if (signo > 0) return `${base} evaluacion-sube`
  if (signo < 0) return `${base} evaluacion-baja`
  return base
}

// "▲ 12,5%", "▼ 3%", "= 0%"; '' si no hay con qué comparar.
function textoPorcentaje(valor) {
  if (valor == null) return ''
  if (valor > 0) return `▲ ${formatearNumero(valor)}%`
  if (valor < 0) return `▼ ${formatearNumero(Math.abs(valor))}%`
  return '= 0%'
}

function textoDiferencia(valor) {
  if (valor == null) return ''
  if (valor > 0) return `▲ ${valor} más`
  if (valor < 0) return `▼ ${Math.abs(valor)} menos`
  return '= igual'
}

// Las medidas no son "buenas" o "malas" (depende del objetivo): van sin color.
function textoCambioMedida(valor, unidad) {
  if (valor == null) return '—'
  if (valor === 0) return `0 ${unidad}`
  return `${valor > 0 ? '+' : '−'}${formatearNumero(Math.abs(valor))} ${unidad}`
}

function textoFecha(fechaISO) {
  if (!fechaISO) return ''
  return new Date(`${fechaISO}T00:00:00`).toLocaleDateString('es-UY', {
    day: 'numeric',
    month: 'long',
  })
}
