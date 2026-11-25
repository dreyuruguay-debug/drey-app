import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import BarraCupos from '../components/BarraCupos.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { esDuenoDe, useEspacios } from '../services/espacio.js'
import { cargarTablero } from '../services/tablero.js'
import { recordado, recordar } from '../services/memoriaSesion.js'
import { linkWhatsApp } from '../utils/whatsapp.js'
import { textoFechaCorta } from '../utils/dias.js'

// Tablero del dueño del gimnasio (supabase/sql/042): todo el gimnasio de
// un vistazo. Arriba los números (cupos, activos, quiénes entrenaron esta
// semana, nuevos del mes); después los alumnos que DEJARON DE VENIR (14
// días o más sin entrenar), con un botón para escribirles por WhatsApp;
// y al final cada profe con sus alumnos.
//
// Lo último que se vio queda en memoria: al volver se muestra al instante
// y se actualiza por detrás.
export default function ProfeTablero() {
  const { activo: espacio } = useEspacios()
  const clave = espacio ? `tablero-${espacio.id}` : null
  const [tablero, setTablero] = useState(() => (clave ? recordado(clave) : null))
  const [error, setError] = useState(false)
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
        <ContenidoTablero tablero={tablero} />
      )}
    </ProfeLayout>
  )
}

function ContenidoTablero({ tablero }) {
  const porcentajeSemana = tablero.activos
    ? Math.round((tablero.entrenaronSemana / tablero.activos) * 100)
    : 0
  const masAlumnos = tablero.profes[0]?.activos > 0 ? tablero.profes[0] : null

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
          <p className="profe-vacio">Nadie dejó de venir. ¡Buenísimo! 💪</p>
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
          <Link to="/profe/equipo" className="home-aviso-pendiente">
            {tablero.sinProfe} {tablero.sinProfe === 1 ? 'alumno no tiene' : 'alumnos no tienen'}{' '}
            profe asignado. Tocá acá para asignarlo.
          </Link>
        )}
      </section>
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
