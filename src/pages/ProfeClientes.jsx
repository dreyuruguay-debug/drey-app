import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import AlumnosDeBaja from '../components/AlumnosDeBaja.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import FiltrosClientes from '../components/clientes/FiltrosClientes.jsx'
import TarjetaCliente from '../components/clientes/TarjetaCliente.jsx'
import TablaClientes from '../components/clientes/TablaClientes.jsx'
import BarraAsignar from '../components/clientes/BarraAsignar.jsx'
import { PANTALLA_COMPU, useCoincide } from '../components/useCoincide.js'
import { supabase } from '../services/supabaseClient.js'
import { clientesDelEspacio, esDuenoDe, useEspacios } from '../services/espacio.js'
import { cargarEquipo } from '../services/equipo.js'
import { cargarActividadClientes } from '../services/actividad.js'
import { recordado, recordar } from '../services/memoriaSesion.js'
import { asignarProfeAVarios, textoDeErrorProfes } from '../services/profes.js'
import { mostrarAviso } from '../services/avisos.js'
import {
  contarSolicitudesPendientes,
  esAdminConocido,
  ultimasSolicitudesPendientes,
  verificarProfe,
} from '../services/accesoProfe.js'
import { obtenerPlan } from '../data/planes.js'
import { fechaLocalDeMomento, obtenerFechaHoyISO } from '../utils/dias.js'
import {
  contarPorFiltro,
  FILTROS,
  filtrarClientes,
  ordenarClientes,
  situacionDelCliente,
} from '../utils/clientes.js'
import { linkWhatsApp } from '../utils/whatsapp.js'

const MS_POR_DIA = 1000 * 60 * 60 * 24

// Lo último que se cargó queda en memoria (services/memoriaSesion.js).
const MEMORIA_CLIENTES = 'profe-clientes'

// Lista de alumnos activos. Desde acá se entra a la ficha de cada uno
// (rutinas, semana, progreso y pagos).
//
// Arriba, el buscador y los chips para filtrar (Todos · No entrenan ·
// Cuota vencida · Cuota al día, con cuántos hay en cada uno; la cuota solo
// la ven el Admin y el dueño del espacio). Los cálculos están en
// utils/clientes.js.
//
//   · En el celular: una tarjeta por alumno con sus iniciales y un puntito
//     de color (verde al día · naranja no entrena hace 5 días o más · rojo
//     cuota vencida) y WhatsApp a un toque (components/clientes/).
//   · En la compu: una tabla con columnas que se ordenan (nombre, profe,
//     último entreno, vencimiento).
//
// El Admin ve a todos los alumnos y filtra por profe (o "sin profe") y por
// gimnasio. El dueño de un gimnasio (con el gimnasio elegido arriba)
// filtra por los profes de su equipo. Los dos pueden elegir varios
// alumnos y asignarles un profe de una vez ("Asignar a un profe"; la base
// controla qué cambio se permite).
//
// Se puede entrar ya filtrado: ?pago=vencidos (el Inicio del dueño),
// ?pago=al-dia, ?filtro=no-entrenan o ?profe=sin (el Inicio del Admin).
export default function ProfeClientes() {
  // Lo último cargado se ve al instante; se actualiza por detrás.
  const [clientes, setClientes] = useState(() => recordado(MEMORIA_CLIENTES) || [])
  const [cargando, setCargando] = useState(() => !recordado(MEMORIA_CLIENTES))
  const [busqueda, setBusqueda] = useState('')
  const [esAdmin, setEsAdmin] = useState(esAdminConocido)
  const [equipo, setEquipo] = useState({ profes: [], gimnasios: [] })
  const [parametros] = useSearchParams()
  const [filtro, setFiltro] = useState(() => filtroInicial(parametros))
  const [filtroProfe, setFiltroProfe] = useState(() =>
    parametros.get('profe') === 'sin' ? 'sin' : '',
  )
  const [filtroGimnasio, setFiltroGimnasio] = useState('')
  const [orden, setOrden] = useState({ campo: 'nombre', ascendente: true })
  // Asignar un profe a varios: en el celular se entra con el botón; en la
  // compu las casillas están siempre.
  const [eligiendo, setEligiendo] = useState(false)
  const [elegidos, setElegidos] = useState(() => new Set())
  const [asignando, setAsignando] = useState(false)
  const enCompu = useCoincide(PANTALLA_COMPU)
  const { activo: espacio } = useEspacios()
  const duenoDeGimnasio = !esAdmin && espacio?.tipo === 'gimnasio' && esDuenoDe(espacio)
  const veCuota = esAdmin || esDuenoDe(espacio)
  const muestraProfe = esAdmin || duenoDeGimnasio
  const puedeAsignar = esAdmin || duenoDeGimnasio
  const hoy = obtenerFechaHoyISO()
  // Alumnos que pidieron entrenar y esperan respuesta (supabase/sql/026).
  const [solicitudes, setSolicitudes] = useState(ultimasSolicitudesPendientes)

  useEffect(() => {
    cargarClientes()
    verificarProfe().then(({ esAdmin: admin }) => setEsAdmin(Boolean(admin)))
    contarSolicitudesPendientes().then(setSolicitudes)
  }, [])

  // Solo el Admin: profes y gimnasios para los filtros y para asignar.
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

  // Dueño de gimnasio: los profes del gimnasio para el filtro y para asignar.
  useEffect(() => {
    if (!duenoDeGimnasio) return
    cargarEquipo(espacio.id).then(({ datos }) =>
      setEquipo({
        profes: (datos || []).map((fila) => ({
          id: fila.perfil_id,
          nombre: fila.nombre,
          apellido: '',
        })),
        gimnasios: [],
      }),
    )
  }, [duenoDeGimnasio, espacio?.id])

  async function cargarClientes() {
    // Los clientes y cuándo entrenó cada uno, en un solo viaje.
    const [{ data: listaClientes }, actividad] = await Promise.all([
      clientesDelEspacio('*').eq('estado', 'activo').order('nombre'),
      cargarActividadClientes(),
    ])

    const ultimaSesionPorCliente = {}
    for (const [clienteId, registro] of actividad)
      ultimaSesionPorCliente[clienteId] = registro.ultima

    const ahora = new Date()
    const conActividad = (listaClientes || []).map((cliente) => {
      // Si nunca entrenó, se cuentan los días desde que se habilitó la
      // cuenta (creado_en), para que un cliente recién habilitado no
      // aparezca como "no entrena" el primer día.
      const fechaBase = ultimaSesionPorCliente[cliente.id] || fechaLocalDeMomento(cliente.creado_en)
      const diasSinEntrenar = fechaBase
        ? Math.max(0, Math.floor((ahora - new Date(`${fechaBase}T00:00:00`)) / MS_POR_DIA))
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

  function nombreDelProfe(id) {
    const profe = profePorId.get(id)
    return profe ? `${profe.nombre} ${profe.apellido || ''}`.trim() : 'Sin profe'
  }

  const cuentas = useMemo(() => contarPorFiltro(clientes, hoy), [clientes, hoy])

  const clientesFiltrados = useMemo(() => {
    const filtrados = filtrarClientes(clientes, {
      texto: busqueda,
      // Sin permiso para ver la cuota, sus chips no aplican.
      filtro: FILTROS.find((item) => item.id === filtro)?.soloCuota && !veCuota ? '' : filtro,
      profe: filtroProfe,
      gimnasio: filtroGimnasio,
      gimnasioDe: (cliente) => [cliente.gimnasio_id, profePorId.get(cliente.profe_id)?.gimnasio_id],
      hoy,
    })
    return ordenarClientes(filtrados, {
      ...orden,
      nombreDelProfe: (cliente) => nombreDelProfe(cliente.profe_id),
    })
  }, [clientes, busqueda, filtro, filtroProfe, filtroGimnasio, profePorId, orden, veCuota, hoy])

  // Lo que muestra cada alumno (tarjeta o fila).
  const filas = clientesFiltrados.map((cliente) => {
    const plan = obtenerPlan(cliente.plan)?.nombre || cliente.plan || 'Sin plan'
    const profe = nombreDelProfe(cliente.profe_id)
    const situacion = situacionDelCliente(cliente, hoy, { veCuota })
    return {
      cliente,
      plan,
      profe,
      situacion,
      whatsapp: linkWhatsApp(cliente.celular, `Hola ${cliente.nombre}!`),
      detalle: [
        plan,
        muestraProfe ? profe : null,
        `Último entreno: ${situacion.entreno.toLowerCase()}`,
      ]
        .filter(Boolean)
        .join(' · '),
    }
  })

  // Tocando el mismo título se invierte; "Último entreno" arranca por
  // los que hace más que no vienen.
  function ordenarPor(campo) {
    setOrden((actual) =>
      actual.campo === campo
        ? { campo, ascendente: !actual.ascendente }
        : { campo, ascendente: campo !== 'entreno' },
    )
  }

  function elegir(id) {
    setElegidos((actual) => {
      const nuevo = new Set(actual)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  function elegirTodos(marcar) {
    setElegidos(marcar ? new Set(clientesFiltrados.map((cliente) => cliente.id)) : new Set())
  }

  function terminarDeElegir() {
    setEligiendo(false)
    setElegidos(new Set())
  }

  async function asignar(profeId) {
    setAsignando(true)
    const { pasaron, noPasaron, error } = await asignarProfeAVarios([...elegidos], profeId)
    setAsignando(false)
    const nombre = nombreDelProfe(profeId)
    if (pasaron > 0) {
      mostrarAviso(
        `${pasaron} ${pasaron === 1 ? 'alumno pasó' : 'alumnos pasaron'} a ${nombre}` +
          (noPasaron > 0
            ? ` · ${noPasaron} no se ${noPasaron === 1 ? 'pudo' : 'pudieron'} pasar`
            : ''),
        noPasaron > 0 ? 'error' : 'ok',
      )
    } else {
      mostrarAviso(
        error ? textoDeErrorProfes(error) : 'No se pudo pasar a ninguno a ese profe',
        'error',
      )
    }
    terminarDeElegir()
    cargarClientes()
  }

  const mostrarBarra = puedeAsignar && (eligiendo || (enCompu && elegidos.size > 0))

  return (
    <ProfeLayout titulo={esAdmin ? 'Alumnos' : 'Clientes'}>
      <div className="acciones-fila">
        <Link to="/profe/rutinas" className="boton-principal">
          + Nueva rutina
        </Link>
        <Link to="/profe/calendario" className="boton-secundario">
          La semana de todos
        </Link>
        <Link to="/profe/progresion" className="boton-secundario">
          Progresión
        </Link>
        <Link to="/profe/solicitudes" className="boton-secundario">
          Solicitudes{solicitudes > 0 ? ` (${solicitudes})` : ''}
        </Link>
        {!esAdmin && (
          <Link to="/profe/mensajes" className="boton-secundario">
            Mensaje a mis alumnos
          </Link>
        )}
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

      <div className="clientes-buscar-fila">
        <input
          className="auth-input profe-buscador"
          type="search"
          placeholder="Buscar alumno…"
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          aria-label="Buscar alumno por nombre"
        />
        {puedeAsignar && !enCompu && !eligiendo && clientes.length > 0 && (
          <button
            type="button"
            className="boton-secundario boton-chico"
            onClick={() => setEligiendo(true)}
          >
            Asignar a un profe
          </button>
        )}
      </div>

      <FiltrosClientes activo={filtro} cuentas={cuentas} veCuota={veCuota} onCambiar={setFiltro} />

      {muestraProfe && (
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
          {esAdmin && equipo.gimnasios.length > 0 && (
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

      {!cargando && clientesFiltrados.length !== clientes.length && (
        <p className="profe-nota">
          {clientesFiltrados.length} de {clientes.length} alumnos activos
        </p>
      )}

      {cargando ? (
        <Esqueleto />
      ) : clientesFiltrados.length === 0 ? (
        <p className="profe-vacio">
          {clientes.length === 0
            ? 'Todavía no tenés alumnos activos. Habilitalos desde "Cobros".'
            : 'No hay ningún alumno que coincida con la búsqueda o los filtros.'}
        </p>
      ) : enCompu ? (
        <TablaClientes
          filas={filas}
          orden={orden}
          onOrdenar={ordenarPor}
          muestraProfe={muestraProfe}
          veCuota={veCuota}
          puedeElegir={puedeAsignar}
          elegidos={elegidos}
          onElegir={elegir}
          onElegirTodos={elegirTodos}
        />
      ) : (
        <div className="clientes-lista">
          {filas.map((fila) => (
            <TarjetaCliente
              key={fila.cliente.id}
              cliente={fila.cliente}
              detalle={fila.detalle}
              situacion={fila.situacion}
              whatsapp={fila.whatsapp}
              eligiendo={eligiendo}
              elegido={elegidos.has(fila.cliente.id)}
              onElegir={elegir}
            />
          ))}
        </div>
      )}

      {mostrarBarra && (
        <BarraAsignar
          cantidad={elegidos.size}
          profes={equipo.profes}
          guardando={asignando}
          onAsignar={asignar}
          onCancelar={terminarDeElegir}
        />
      )}

      <AlumnosDeBaja onCambio={cargarClientes} />
    </ProfeLayout>
  )
}

function filtroInicial(parametros) {
  const pago = parametros.get('pago')
  if (pago === 'vencidos' || pago === 'al-dia') return pago
  return parametros.get('filtro') === 'no-entrenan' ? 'no-entrenan' : ''
}
