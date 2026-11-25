import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import BarraCupos from '../components/BarraCupos.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { esDuenoDe, useEspacios } from '../services/espacio.js'
import { cargarSemanasTablero, cargarTablero, SEMANAS_DEL_TABLERO } from '../services/tablero.js'
import GraficoProgreso from '../components/GraficoProgreso.jsx'
import Icono from '../components/Icono.jsx'
import { mostrarAviso } from '../services/avisos.js'
import { recordado, recordar } from '../services/memoriaSesion.js'
import { linkWhatsApp } from '../utils/whatsapp.js'
import { textoFechaCorta } from '../utils/dias.js'

// Tablero del dueño del gimnasio (supabase/sql/042): todo el gimnasio de
// un vistazo. Arriba los números (cupos, activos, quiénes entrenaron esta
// semana, nuevos del mes); la gráfica de las últimas 8 semanas (cuántos
// alumnos entrenaron cada semana, supabase/sql/044); los alumnos que
// DEJARON DE VENIR (14 días o más sin entrenar), con un botón para
// escribirles por WhatsApp; y al final cada profe con sus alumnos y una
// barrita con cuánto de la carga del gimnasio lleva cada uno.
//
// "Bajar alumnos en Excel" arma la planilla con todos los alumnos activos
// (services/exportarAlumnos.js).
//
// Lo último que se vio queda en memoria: al volver se muestra al instante
// y se actualiza por detrás.
export default function ProfeTablero() {
  const { activo: espacio } = useEspacios()
  const clave = espacio ? `tablero-${espacio.id}` : null
  const [tablero, setTablero] = useState(() => (clave ? recordado(clave) : null))
  const [error, setError] = useState(false)
  const [semanas, setSemanas] = useState(null)
  const esDueno = espacio && esDuenoDe(espacio)

  useEffect(() => {
    if (!espacio || !esDueno) return undefined
    let vigente = true
    cargarTablero(espacio.id).then(({ tablero: datos, error: fallo }) => {
      if (!vigente) return
      setError(Boolean(fallo))
      if (datos) {
        recordar(`tablero-${espacio.id}`, datos)
        setTablero(datos)
      }
    })
    cargarSemanasTablero(espacio.id).then(({ semanas: lista }) => {
      if (vigente) setSemanas(lista)
    })
    return () => {
      vigente = false
    }
  }, [espacio?.id, esDueno])

  const titulo = espacio?.tipo === 'gimnasio' ? `${espacio.nombre} de un vistazo` : 'Tablero'

  if (espacio && !esDueno) {
    return (
      <ProfeLayout titulo="Tablero" volverA="/profe">
        <p className="profe-vacio">El tablero lo ve solo el dueño del gimnasio.</p>
      </ProfeLayout>
    )
  }

  return (
    <ProfeLayout titulo={titulo} volverA="/profe">
      {!tablero ? (
        error ? (
          <p className="profe-vacio">
            No pudimos cargar el tablero. Si recién se actualizó la app, falta correr el SQL 042.
          </p>
        ) : (
          <Esqueleto />
        )
      ) : (
        <ContenidoTablero tablero={tablero} semanas={semanas} espacio={espacio} />
      )}
    </ProfeLayout>
  )
}

function ContenidoTablero({ tablero, semanas, espacio }) {
  const [bajando, setBajando] = useState(false)
  const porcentajeSemana = tablero.activos
    ? Math.round((tablero.entrenaronSemana / tablero.activos) * 100)
    : 0
  const masAlumnos = tablero.profes[0]?.activos > 0 ? tablero.profes[0] : null
  const totalConProfe = tablero.profes.reduce((total, profe) => total + (profe.activos || 0), 0)

  async function bajarExcel() {
    setBajando(true)
    try {
      const { bajarAlumnosEnExcel } = await import('../services/exportarAlumnos.js')
      const porId = new Map(tablero.profes.map((profe) => [profe.id, profe.nombre]))
      const cantidad = await bajarAlumnosEnExcel({
        nombreDelProfe: (id) => porId.get(id) || 'Sin profe',
        nombreArchivo: `Alumnos ${espacio?.nombre || 'DREY'}`,
      })
      mostrarAviso(`Planilla con ${cantidad} ${cantidad === 1 ? 'alumno' : 'alumnos'} descargada`)
    } catch {
      mostrarAviso('No pudimos armar la planilla. Probá de nuevo.', 'error')
    }
    setBajando(false)
  }

  return (
    <div className="tablero">
      <section className="tablero-numeros">
        <div className="tablero-numero tablero-cupos">
          <BarraCupos total={tablero.cuposTotal} usados={tablero.cuposUsados} etiqueta="Cupos" />
          <small>
            {tablero.cuposTotal == null
              ? 'Sin tope de alumnos'
              : `${Math.max(0, tablero.cuposTotal - tablero.cuposUsados)} cupos libres`}
          </small>
        </div>
        <Link to="/profe/clientes" className="tablero-numero">
          <strong>{tablero.activos}</strong>
          <span>alumnos activos</span>
        </Link>
        <div className="tablero-numero">
          <strong>
            {tablero.entrenaronSemana}
            <em> · {porcentajeSemana} %</em>
          </strong>
          <span>entrenaron esta semana</span>
        </div>
        <div className="tablero-numero">
          <strong>{tablero.nuevosMes}</strong>
          <span>se sumaron este mes</span>
        </div>
      </section>

      <div className="tablero-acciones">
        <button
          type="button"
          className="boton-secundario boton-chico"
          onClick={bajarExcel}
          disabled={bajando}
        >
          <Icono nombre="descargar" /> {bajando ? 'Armando la planilla…' : 'Bajar alumnos en Excel'}
        </button>
      </div>

      {semanas && semanas.length > 0 && (
        <section className="tablero-seccion">
          <div className="tablero-seccion-cabecera">
            <h2>Últimas {SEMANAS_DEL_TABLERO} semanas</h2>
          </div>
          <p className="profe-nota">
            Cuántos alumnos distintos entrenaron cada semana. Tocá una barra para ver el número.
          </p>
          <GraficoProgreso
            tipo="barras"
            titulo="Alumnos que entrenaron"
            puntos={semanas.map((fila) => ({
              etiqueta: textoFechaCorta(fila.semana),
              valor: fila.alumnos,
            }))}
          />
        </section>
      )}

      <section className="tablero-seccion">
        <div className="tablero-seccion-cabecera">
          <h2>Dejaron de venir</h2>
          <span
            className={
              tablero.dejaronDeVenir.length ? 'estado-chip estado-alerta' : 'estado-chip estado-ok'
            }
          >
            {tablero.dejaronDeVenir.length}
          </span>
        </div>
        <p className="profe-nota">
          Alumnos activos que no entrenan hace {tablero.diasSinVenir} días o más. Un mensaje a
          tiempo ayuda a que no se den de baja.
        </p>
        {tablero.dejaronDeVenir.length === 0 ? (
          <p className="profe-vacio">Nadie dejó de venir. ¡Buenísimo!</p>
        ) : (
          <div className="tablero-lista">
            {tablero.dejaronDeVenir.map((alumno) => (
              <AlumnoQueDejo key={alumno.id} alumno={alumno} />
            ))}
          </div>
        )}
      </section>

      <section className="tablero-seccion">
        <div className="tablero-seccion-cabecera">
          <h2>Profes</h2>
        </div>
        {tablero.profes.length === 0 ? (
          <p className="profe-vacio">Todavía no hay profes en el equipo.</p>
        ) : (
          <div className="tablero-profes">
            {tablero.profes.map((profe) => (
              <div key={profe.id} className="tablero-profe">
                <div className="tablero-profe-nombre">
                  <strong>{profe.nombre}</strong>
                  {profe.rol === 'dueno' && <small className="tablero-rol">Dueño</small>}
                  {masAlumnos?.id === profe.id && (
                    <span className="chip chip-chico tablero-destacado">Más alumnos</span>
                  )}
                </div>
                <BarraCarga activos={profe.activos} total={totalConProfe} />
                <dl className="tablero-profe-numeros">
                  <div>
                    <dt>Activos</dt>
                    <dd>{profe.activos}</dd>
                  </div>
                  <div>
                    <dt>Entrenaron esta semana</dt>
                    <dd>{profe.entrenaron_semana}</dd>
                  </div>
                  <div className={profe.dejaron_de_venir > 0 ? 'tablero-profe-alerta' : ''}>
                    <dt>Dejaron de venir</dt>
                    <dd>{profe.dejaron_de_venir}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
        {tablero.sinProfe > 0 && (
          <Link to="/profe/clientes?profe=sin" className="home-aviso-pendiente">
            {tablero.sinProfe} {tablero.sinProfe === 1 ? 'alumno no tiene' : 'alumnos no tienen'}{' '}
            profe asignado. Tocá acá para asignarlo.
          </Link>
        )}
      </section>
    </div>
  )
}

// Cuánto de la carga del gimnasio lleva un profe: sus alumnos activos
// sobre los de todos los profes, para repartir mejor.
function BarraCarga({ activos, total }) {
  const porcentaje = total ? Math.round(((activos || 0) / total) * 100) : 0
  return (
    <div className="tablero-carga">
      <div className="tablero-carga-barra" aria-hidden="true">
        <span style={{ width: `${porcentaje}%` }} />
      </div>
      <small>{porcentaje} % de los alumnos del gimnasio</small>
    </div>
  )
}

function AlumnoQueDejo({ alumno }) {
  const nombre = [alumno.nombre, alumno.apellido].filter(Boolean).join(' ')
  const cuando = alumno.ultima
    ? `Última vez: ${textoFechaCorta(alumno.ultima)} (hace ${alumno.dias} días)`
    : `Nunca entrenó (se sumó hace ${alumno.dias} días)`
  const whatsapp = linkWhatsApp(
    alumno.celular,
    `¡Hola ${alumno.nombre || ''}! Te extrañamos en el gimnasio. ¿Todo bien? Cuando quieras volvemos a entrenar 💪`,
  )
  return (
    <div className="tablero-alumno">
      <Link to={`/profe/clientes/${alumno.id}`} className="tablero-alumno-textos">
        <strong>{nombre}</strong>
        <small>{cuando}</small>
        {alumno.profe && <small>Profe: {alumno.profe}</small>}
      </Link>
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="boton-secundario boton-chico"
        >
          Escribirle
        </a>
      )}
    </div>
  )
}
