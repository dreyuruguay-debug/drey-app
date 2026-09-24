import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { obtenerPlan } from '../data/planes.js'

// A partir de esta cantidad de días sin entrenar, el cliente aparece
// marcado como "inactivo" en la lista, para que el profe lo note sin
// tener que entrar a revisar cada uno.
const UMBRAL_DIAS_INACTIVO = 5
const MS_POR_DIA = 1000 * 60 * 60 * 24

// Lista de clientes activos. Desde acá se entra a la ficha de cada uno
// (rutinas, semana, progreso y pagos). Tiene un buscador (para cuando la lista crezca) y marca a
// los que no entrenan hace varios días, calculado a partir de su
// última sesión guardada en la tabla "sesiones".
export default function ProfeClientes() {
  const [clientes, setClientes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    cargarClientes()
  }, [])

  async function cargarClientes() {
    setCargando(true)
    const { data: listaClientes } = await supabase
      .from('perfiles')
      .select('*')
      .eq('estado', 'activo')
      .eq('es_profe', false)
      .order('nombre')

    const clientesData = listaClientes || []
    const ids = clientesData.map((cliente) => cliente.id)

    // Última fecha entrenada de cada cliente: se pide ordenado por
    // fecha descendente y nos quedamos con la primera aparición de
    // cada cliente_id (Supabase no tiene un "group by" directo desde
    // acá, así que el agrupado se hace en el navegador).
    let ultimaSesionPorCliente = {}
    if (ids.length > 0) {
      const { data: sesiones } = await supabase
        .from('sesiones')
        .select('cliente_id, fecha')
        .in('cliente_id', ids)
        .order('fecha', { ascending: false })
      for (const sesion of sesiones || []) {
        if (!ultimaSesionPorCliente[sesion.cliente_id]) {
          ultimaSesionPorCliente[sesion.cliente_id] = sesion.fecha
        }
      }
    }

    const hoy = new Date()
    const conActividad = clientesData.map((cliente) => {
      // Si nunca entrenó, se cuentan los días desde que se habilitó la
      // cuenta (creado_en), para que un cliente recién habilitado no
      // aparezca como "inactivo" el primer día.
      const fechaBase = ultimaSesionPorCliente[cliente.id] || cliente.creado_en?.slice(0, 10)
      const diasSinEntrenar = fechaBase
        ? Math.floor((hoy - new Date(`${fechaBase}T00:00:00`)) / MS_POR_DIA)
        : null
      return { ...cliente, diasSinEntrenar }
    })

    setClientes(conActividad)
    setCargando(false)
  }

  const clientesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return clientes
    return clientes.filter((cliente) =>
      `${cliente.nombre} ${cliente.apellido}`.toLowerCase().includes(texto),
    )
  }, [clientes, busqueda])

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
      </div>

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

      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : clientesFiltrados.length === 0 ? (
        <p className="profe-vacio">
          {clientes.length === 0
            ? 'Todavía no tenés clientes activos. Habilitalos desde "Pagos".'
            : 'No hay ningún cliente que coincida con la búsqueda.'}
        </p>
      ) : (
        clientesFiltrados.map((cliente) => {
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
        })
      )}
    </ProfeLayout>
  )
}
