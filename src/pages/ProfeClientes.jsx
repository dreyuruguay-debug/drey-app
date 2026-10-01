import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { cargarActividadClientes } from '../services/actividad.js'
import { recordado, recordar } from '../services/memoriaSesion.js'
import {
  contarSolicitudesPendientes,
  esAdminConocido,
  ultimasSolicitudesPendientes,
  verificarProfe,
} from '../services/accesoProfe.js'
import { obtenerPlan } from '../data/planes.js'
import { fechaLocalDeMomento } from '../utils/dias.js'
import Esqueleto from '../components/Esqueleto.jsx'
import { SOLO_CLIENTES } from '../utils/roles.js'

// A partir de esta cantidad de días sin entrenar, el cliente aparece
// marcado como "inactivo" en la lista, para que el profe lo note sin
// tener que entrar a revisar cada uno.
const UMBRAL_DIAS_INACTIVO = 5
const MS_POR_DIA = 1000 * 60 * 60 * 24

// Lo último que se cargó queda en memoria (services/memoriaSesion.js).
const MEMORIA_CLIENTES = 'profe-clientes'

// Lista de clientes activos. Desde acá se entra a la ficha de cada uno
// (rutinas, semana, progreso y pagos). Tiene un buscador (para cuando la lista crezca) y marca a
// los que no entrenan hace varios días, calculado a partir de su
// última sesión guardada en la tabla "sesiones".
//
// El Admin ve a todos los clientes y puede filtrarlos por profe (o "sin
// profe") y por gimnasio; en cada cliente ve quién es su profe.
export default function ProfeClientes() {
  // Lo último cargado se ve al instante; se actualiza por detrás.
  const [clientes, setClientes] = useState(() => recordado(MEMORIA_CLIENTES) || [])
  const [cargando, setCargando] = useState(() => !recordado(MEMORIA_CLIENTES))
  const [busqueda, setBusqueda] = useState('')
  const [esAdmin, setEsAdmin] = useState(esAdminConocido)
  const [equipo, setEquipo] = useState({ profes: [], gimnasios: [] })
  const [filtroProfe, setFiltroProfe] = useState('')
  const [filtroGimnasio, setFiltroGimnasio] = useState('')
  // Alumnos que pidieron entrenar y esperan respuesta (supabase/sql/026).
  const [solicitudes, setSolicitudes] = useState(ultimasSolicitudesPendientes)

  useEffect(() => {
    cargarClientes()
    verificarProfe().then(({ esAdmin: admin }) => setEsAdmin(Boolean(admin)))
    contarSolicitudesPendientes().then(setSolicitudes)
  }, [])

  // Solo el Admin: profes y gimnasios para los filtros.
  useEffect(() => {
    if (!esAdmin) return
    Promise.all([
      supabase
        .from('perfiles')
        .select('id, nombre, apellido, gimnasio_id')
        .eq('es_profe', true)
        .order('nombre'),
      supabase.from('gimnasios').select('id, nombre').order('nombre'),
    ]).then(([{ data: profes }, { data: gimnasios }]) =>
      setEquipo({ profes: profes || [], gimnasios: gimnasios || [] }),
    )
  }, [esAdmin])

  async function cargarClientes() {
    // Los clientes y cuándo entrenó cada uno, en un solo viaje.
    const [{ data: listaClientes }, actividad] = await Promise.all([
      supabase
        .from('perfiles')
        .select('*')
        .eq('estado', 'activo')
        .match(SOLO_CLIENTES)
        .order('nombre'),
      cargarActividadClientes(),
    ])

    const clientesData = listaClientes || []
    const ultimaSesionPorCliente = {}
    for (const [clienteId, registro] of actividad)
      ultimaSesionPorCliente[clienteId] = registro.ultima

    const hoy = new Date()
    const conActividad = clientesData.map((cliente) => {
      // Si nunca entrenó, se cuentan los días desde que se habilitó la
      // cuenta (creado_en), para que un cliente recién habilitado no
      // aparezca como "inactivo" el primer día.
      const fechaBase = ultimaSesionPorCliente[cliente.id] || fechaLocalDeMomento(cliente.creado_en)
      const diasSinEntrenar = fechaBase
        ? Math.max(0, Math.floor((hoy - new Date(`${fechaBase}T00:00:00`)) / MS_POR_DIA))
        : null
      return { ...cliente, diasSinEntrenar }
    })

    recordar(MEMORIA_CLIENTES, conActividad)
    setClientes(conActividad)
    setCargando(false)
  }

  const profePorId = useMemo(
    () => new Map(equipo.profes.map((profe) => [profe.id, profe])),
    [equipo.profes],
  )

  const clientesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return clientes.filter((cliente) => {
      if (texto && !`${cliente.nombre} ${cliente.apellido}`.toLowerCase().includes(texto)) {
        return false
      }
      if (filtroProfe === 'sin' && cliente.profe_id) return false
      if (filtroProfe && filtroProfe !== 'sin' && cliente.profe_id !== filtroProfe) return false
      if (filtroGimnasio) {
        const gimnasioDelProfe = profePorId.get(cliente.profe_id)?.gimnasio_id
        if (cliente.gimnasio_id !== filtroGimnasio && gimnasioDelProfe !== filtroGimnasio) {
          return false
        }
      }
      return true
    })
  }, [clientes, busqueda, filtroProfe, filtroGimnasio, profePorId])

  function nombreDelProfe(id) {
    const profe = profePorId.get(id)
    return profe ? `${profe.nombre} ${profe.apellido || ''}`.trim() : 'Sin profe'
  }

  const inactivos = clientes.filter(
    (cliente) =>
      cliente.diasSinEntrenar !== null && cliente.diasSinEntrenar >= UMBRAL_DIAS_INACTIVO,
  )

  return (
    <ProfeLayout titulo="Clientes">
      <p className="profe-nota">
        Tocá un cliente para ver sus rutinas, su semana, su progreso y sus pagos.
      </p>
      <div className="acciones-fila">
        <Link to="/profe/rutinas" className="boton-principal">
          + Nueva rutina
        </Link>
        <Link to="/profe/calendario" className="boton-secundario">
          La semana de todos
        </Link>
        <Link to="/profe/solicitudes" className="boton-secundario">
          Solicitudes{solicitudes > 0 ? ` (${solicitudes})` : ''}
        </Link>
      </div>

      {solicitudes > 0 && (
        <Link to="/profe/solicitudes" className="aviso-solicitudes-nuevas">
          <strong>
            {esAdmin
              ? `${solicitudes} ${solicitudes === 1 ? 'solicitud espera' : 'solicitudes esperan'} respuesta de un profe`
              : solicitudes === 1
                ? '1 alumno quiere entrenar con vos'
                : `${solicitudes} alumnos quieren entrenar con vos`}
          </strong>
          <span>{esAdmin ? 'Ver solicitudes de todos los profes ›' : 'Aceptá o rechazá ›'}</span>
        </Link>
      )}

      {!cargando && inactivos.length > 0 && (
        <div className="profe-aviso-inactivos">
          <p className="profe-aviso-inactivos-titulo">
            {inactivos.length === 1
              ? '1 cliente no entrena hace varios días'
              : `${inactivos.length} clientes no entrenan hace varios días`}
          </p>
          <p className="profe-aviso-inactivos-lista">
            {inactivos.map((cliente) => `${cliente.nombre} ${cliente.apellido}`).join(' · ')}
          </p>
        </div>
      )}

      <input
        className="auth-input profe-buscador"
        type="text"
        placeholder="Buscar cliente por nombre…"
        value={busqueda}
        onChange={(event) => setBusqueda(event.target.value)}
      />

      {esAdmin && (
        <div className="codigo-fila clientes-filtros">
          <select
            className="profe-calendario-select"
            value={filtroProfe}
            onChange={(event) => setFiltroProfe(event.target.value)}
            aria-label="Filtrar por profe"
          >
            <option value="">Todos los profes</option>
            <option value="sin">Sin profe</option>
            {equipo.profes.map((profe) => (
              <option key={profe.id} value={profe.id}>
                {profe.nombre} {profe.apellido}
              </option>
            ))}
          </select>
          {equipo.gimnasios.length > 0 && (
            <select
              className="profe-calendario-select"
              value={filtroGimnasio}
              onChange={(event) => setFiltroGimnasio(event.target.value)}
              aria-label="Filtrar por gimnasio"
            >
              <option value="">Todos los gimnasios</option>
              {equipo.gimnasios.map((gimnasio) => (
                <option key={gimnasio.id} value={gimnasio.id}>
                  {gimnasio.nombre}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {esAdmin && !cargando && (
        <p className="profe-nota">
          {clientesFiltrados.length} de {clientes.length} clientes activos
        </p>
      )}

      {cargando ? (
        <Esqueleto />
      ) : clientesFiltrados.length === 0 ? (
        <p className="profe-vacio">
          {clientes.length === 0
            ? 'Todavía no tenés clientes activos. Habilitalos desde "Pagos".'
            : 'No hay ningún cliente que coincida con la búsqueda o los filtros.'}
        </p>
      ) : (
        <div className="clientes-lista">
          {clientesFiltrados.map((cliente) => {
            const esInactivo =
              cliente.diasSinEntrenar !== null && cliente.diasSinEntrenar >= UMBRAL_DIAS_INACTIVO
            return (
              <Link
                key={cliente.id}
                to={`/profe/clientes/${cliente.id}`}
                className={
                  esInactivo
                    ? 'profe-cliente-card profe-cliente-card-link profe-cliente-card-inactivo'
                    : 'profe-cliente-card profe-cliente-card-link'
                }
              >
                <div>
                  <p className="profe-cliente-nombre">
                    {cliente.nombre} {cliente.apellido}
                  </p>
                  <p className="profe-cliente-detalle">
                    {obtenerPlan(cliente.plan)?.nombre || cliente.plan || 'Sin plan'}
                    {esAdmin && ` · ${nombreDelProfe(cliente.profe_id)}`}
                    {cliente.diasSinEntrenar !== null && (
                      <>
                        {' · '}
                        {esInactivo ? (
                          <span className="profe-cliente-inactivo-texto">
                            {cliente.diasSinEntrenar === 0
                              ? 'entrenó hoy'
                              : `sin entrenar hace ${cliente.diasSinEntrenar} días`}
                          </span>
                        ) : cliente.diasSinEntrenar === 0 ? (
                          'entrenó hoy'
                        ) : (
                          `última vez hace ${cliente.diasSinEntrenar} días`
                        )}
                      </>
                    )}
                  </p>
                </div>
                <span className="profe-cliente-flecha">→</span>
              </Link>
            )
          })}
        </div>
      )}
    </ProfeLayout>
  )
}
