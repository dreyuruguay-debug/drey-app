import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { mostrarAviso } from '../services/avisos.js'
import { estadoDelPlan } from '../data/vencimiento.js'
import { obtenerFechaHoyISO, obtenerLunesDeSemana } from '../utils/dias.js'
import { esCliente, esProfe } from '../utils/roles.js'
import Esqueleto from '../components/Esqueleto.jsx'

// Equipo y gimnasios (supabase/sql/018 y 020).
//
//   · ADMIN (la cuenta del dueño de DREY, no es profe): suma profes (a
//     partir de una cuenta ya registrada) y les quita el permiso, crea
//     gimnasios, les pone dueño, asigna cada profe a un gimnasio y pasa
//     cualquier cliente de un profe a otro.
//   · DUEÑO DE GIMNASIO: ve a los profes de su gimnasio con sus números
//     (clientes activos, quiénes entrenaron esta semana) y puede pasar un
//     cliente de un profe a otro.
//
// Lo que cada uno puede ver y cambiar lo controla la base de datos.

// Mensajes que manda la base cuando un cambio no se puede hacer (020).
const MENSAJES_DE_LA_BASE = [
  'Primero pasá sus clientes a otro profe',
  'Esa cuenta no es de un profe',
]

function textoDeError(error) {
  return (
    MENSAJES_DE_LA_BASE.find((texto) => error?.message?.includes(texto)) ||
    'No pudimos guardar el cambio'
  )
}

export default function ProfeEquipo() {
  const [cargando, setCargando] = useState(true)
  const [rol, setRol] = useState(null)
  const [perfiles, setPerfiles] = useState([])
  const [gimnasios, setGimnasios] = useState([])
  const [entrenaron, setEntrenaron] = useState(new Set())
  const [email, setEmail] = useState('')
  const [encontrada, setEncontrada] = useState(null)
  const [nombreGimnasio, setNombreGimnasio] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [filtroClientes, setFiltroClientes] = useState('')
  const [quitando, setQuitando] = useState(null)
  const hoy = obtenerFechaHoyISO()

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: miRol }, { data: listaPerfiles }, { data: listaGimnasios }, { data: sesiones }] =
      await Promise.all([
        supabase.rpc('mi_rol'),
        supabase.from('perfiles').select('*').order('nombre'),
        supabase.from('gimnasios').select('*').order('nombre'),
        supabase.from('sesiones').select('cliente_id').gte('fecha', obtenerLunesDeSemana(hoy)),
      ])
    setRol(miRol || { es_admin: false, gimnasios: [] })
    setPerfiles(listaPerfiles || [])
    setGimnasios(listaGimnasios || [])
    setEntrenaron(new Set((sesiones || []).map((sesion) => sesion.cliente_id)))
    setCargando(false)
  }

  async function cambiar(tabla, id, cambios, textoOk) {
    const { error } = await supabase.from(tabla).update(cambios).eq('id', id)
    mostrarAviso(error ? textoDeError(error) : textoOk, error ? 'error' : 'ok')
    if (!error) cargar()
  }

  async function buscar(event) {
    event.preventDefault()
    setMensaje('')
    setEncontrada(null)
    const { data } = await supabase.rpc('buscar_cuenta_por_email', { p_email: email })
    if (!data?.length) {
      setMensaje('No hay ninguna cuenta con ese email. Primero tiene que registrarse en la app.')
      return
    }
    setEncontrada(data[0])
  }

  async function hacerProfe() {
    await cambiar('perfiles', encontrada.id, { es_profe: true }, `${encontrada.nombre} ya es profe`)
    setEncontrada(null)
    setEmail('')
  }

  async function quitarProfe(profe) {
    setQuitando(null)
    await cambiar('perfiles', profe.id, { es_profe: false }, `${profe.nombre} ya no es profe`)
  }

  async function crearGimnasio(event) {
    event.preventDefault()
    if (!nombreGimnasio.trim()) return
    const { error } = await supabase.from('gimnasios').insert({ nombre: nombreGimnasio.trim() })
    mostrarAviso(error ? 'No pudimos crearlo' : 'Gimnasio creado', error ? 'error' : 'ok')
    if (!error) {
      setNombreGimnasio('')
      cargar()
    }
  }

  if (cargando) {
    return (
      <ProfeLayout titulo="Equipo y gimnasios" volverA="/profe">
        <Esqueleto />
      </ProfeLayout>
    )
  }

  const profes = perfiles.filter(esProfe)
  const clientes = perfiles.filter(esCliente)
  const misGimnasios = rol.gimnasios || []
  const nombreDeProfe = (id) => {
    const profe = profes.find((item) => item.id === id)
    return profe ? `${profe.nombre} ${profe.apellido || ''}`.trim() : 'Sin profe'
  }

  const clientesFiltrados = filtrarPorNombre(clientes, filtroClientes)

  if (!rol.es_admin && misGimnasios.length === 0) {
    return (
      <ProfeLayout titulo="Equipo y gimnasios" volverA="/profe">
        <p className="profe-vacio">
          Esta sección es para el Admin de DREY y los dueños de gimnasio.
        </p>
      </ProfeLayout>
    )
  }

  return (
    <ProfeLayout titulo="Equipo y gimnasios" volverA="/profe">
      {mensaje && <p className="auth-message">{mensaje}</p>}

      {rol.es_admin && (
        <>
          <p className="profe-seccion-label">Sumar un profe</p>
          <p className="profe-nota">
            La persona primero se registra en la app como cualquier cliente. Después la buscás acá
            por su email y la hacés profe.
          </p>
          <form className="pago-mp-form-codigo" onSubmit={buscar}>
            <input
              className="auth-input"
              type="email"
              placeholder="Email de la cuenta"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button type="submit" className="boton-secundario boton-chico">
              Buscar
            </button>
          </form>
          {encontrada && (
            <div className="codigo-item equipo-encontrada">
              <div className="codigo-item-textos">
                <strong>
                  {encontrada.nombre} {encontrada.apellido}
                </strong>
                <small>
                  {encontrada.es_admin
                    ? 'Es la cuenta Admin'
                    : encontrada.es_profe
                      ? 'Ya es profe'
                      : 'Cuenta de cliente'}
                </small>
              </div>
              {!encontrada.es_profe && !encontrada.es_admin && (
                <button type="button" className="boton-principal boton-chico" onClick={hacerProfe}>
                  Hacer profe
                </button>
              )}
            </div>
          )}

          <p className="profe-seccion-label">Profes ({profes.length})</p>
          <div className="lista-tarjetas">
            {profes.map((profe) => {
              const cantidadClientes = clientes.filter(
                (cliente) => cliente.profe_id === profe.id,
              ).length
              return (
                <div key={profe.id} className="codigo-item equipo-profe">
                  <div className="codigo-item-textos">
                    <strong>
                      {profe.nombre} {profe.apellido}
                    </strong>
                    <small>{cantidadClientes} clientes</small>
                  </div>
                  <div className="equipo-gimnasio-acciones">
                    <select
                      className="profe-calendario-select"
                      value={profe.gimnasio_id || ''}
                      onChange={(event) =>
                        cambiar(
                          'perfiles',
                          profe.id,
                          { gimnasio_id: event.target.value || null },
                          'Gimnasio asignado',
                        )
                      }
                      aria-label={`Gimnasio de ${profe.nombre}`}
                    >
                      <option value="">Sin gimnasio</option>
                      {gimnasios.map((gimnasio) => (
                        <option key={gimnasio.id} value={gimnasio.id}>
                          {gimnasio.nombre}
                        </option>
                      ))}
                    </select>
                    {quitando === profe.id ? (
                      <div className="equipo-confirmar">
                        <button
                          type="button"
                          className="boton-peligro boton-chico"
                          onClick={() => quitarProfe(profe)}
                        >
                          Sí, quitar
                        </button>
                        <button
                          type="button"
                          className="boton-secundario boton-chico"
                          onClick={() => setQuitando(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="boton-secundario boton-chico"
                        disabled={cantidadClientes > 0}
                        title={
                          cantidadClientes > 0
                            ? 'Primero pasá sus clientes a otro profe'
                            : undefined
                        }
                        onClick={() => setQuitando(profe.id)}
                      >
                        Quitar profe
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {profes.some((profe) => clientes.some((cliente) => cliente.profe_id === profe.id)) && (
            <p className="profe-nota">
              Para quitarle el permiso a un profe con clientes, primero pasá sus clientes a otro
              profe (abajo, en Clientes).
            </p>
          )}

          <p className="profe-seccion-label">Gimnasios ({gimnasios.length})</p>
          <div className="lista-tarjetas">
            {gimnasios.map((gimnasio) => (
              <div
                key={gimnasio.id}
                className={gimnasio.activo ? 'codigo-item' : 'codigo-item codigo-pausado'}
              >
                <div className="codigo-item-textos">
                  <strong>{gimnasio.nombre}</strong>
                  <small>
                    {profes.filter((profe) => profe.gimnasio_id === gimnasio.id).length} profes ·{' '}
                    {gimnasio.activo ? 'se puede elegir al registrarse' : 'oculto'}
                  </small>
                </div>
                <div className="equipo-gimnasio-acciones">
                  <select
                    className="profe-calendario-select"
                    value={gimnasio.dueno_id || ''}
                    onChange={(event) =>
                      cambiar(
                        'gimnasios',
                        gimnasio.id,
                        { dueno_id: event.target.value || null },
                        'Dueño guardado',
                      )
                    }
                    aria-label={`Dueño de ${gimnasio.nombre}`}
                  >
                    <option value="">Sin dueño</option>
                    {profes.map((profe) => (
                      <option key={profe.id} value={profe.id}>
                        Dueño: {profe.nombre} {profe.apellido}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="boton-secundario boton-chico"
                    onClick={() =>
                      cambiar(
                        'gimnasios',
                        gimnasio.id,
                        { activo: !gimnasio.activo },
                        gimnasio.activo ? 'Gimnasio oculto' : 'Gimnasio visible',
                      )
                    }
                  >
                    {gimnasio.activo ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <form className="pago-mp-form-codigo" onSubmit={crearGimnasio}>
            <input
              className="auth-input"
              type="text"
              placeholder="Nombre del gimnasio nuevo"
              value={nombreGimnasio}
              onChange={(event) => setNombreGimnasio(event.target.value)}
            />
            <button type="submit" className="boton-secundario boton-chico">
              Crear
            </button>
          </form>

          <p className="profe-seccion-label">Clientes ({clientes.length})</p>
          <p className="profe-nota">Para pasar un cliente a otro profe, elegilo en la lista.</p>
          <input
            className="auth-input equipo-filtro"
            type="search"
            placeholder="Buscar cliente por nombre"
            value={filtroClientes}
            onChange={(event) => setFiltroClientes(event.target.value)}
          />
          <ListaReasignar
            clientes={clientesFiltrados}
            profes={profes}
            nombreDeProfe={nombreDeProfe}
            onCambiar={cambiar}
          />
        </>
      )}

      {misGimnasios.map((gimnasio) => {
        const suyos = profes.filter((profe) => profe.gimnasio_id === gimnasio.id)
        const idsSuyos = new Set(suyos.map((profe) => profe.id))
        const clientesDelGimnasio = clientes.filter(
          (cliente) => idsSuyos.has(cliente.profe_id) || cliente.gimnasio_id === gimnasio.id,
        )
        return (
          <section key={gimnasio.id} className="bloque-pagina">
            <p className="profe-seccion-label">Tu gimnasio: {gimnasio.nombre}</p>
            <div className="profe-tabla-wrap">
              <table className="profe-tabla">
                <thead>
                  <tr>
                    <th>Profe</th>
                    <th>Activos</th>
                    <th>Entrenaron esta semana</th>
                  </tr>
                </thead>
                <tbody>
                  {suyos.map((profe) => {
                    const activos = clientesDelGimnasio.filter(
                      (cliente) =>
                        cliente.profe_id === profe.id &&
                        cliente.estado === 'activo' &&
                        estadoDelPlan(cliente, hoy).tipo !== 'vencido',
                    )
                    return (
                      <tr key={profe.id}>
                        <td>
                          {profe.nombre} {profe.apellido}
                        </td>
                        <td>{activos.length}</td>
                        <td>{activos.filter((cliente) => entrenaron.has(cliente.id)).length}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Link
              to="/profe/estadisticas"
              className="boton-secundario boton-chico equipo-estadisticas"
            >
              Ver estadísticas del gimnasio
            </Link>

            <p className="profe-seccion-label">
              Clientes del gimnasio ({clientesDelGimnasio.length})
            </p>
            <p className="profe-nota">Para pasar un cliente a otro profe, elegilo en la lista.</p>
            <ListaReasignar
              clientes={clientesDelGimnasio}
              profes={suyos}
              nombreDeProfe={nombreDeProfe}
              onCambiar={cambiar}
            />
          </section>
        )
      })}
    </ProfeLayout>
  )
}

// Lista de clientes con un selector para pasarlos a otro profe. La usan
// el Admin (todos los clientes, todos los profes) y el dueño de un
// gimnasio (los de su gimnasio, sus profes).
function ListaReasignar({ clientes, profes, nombreDeProfe, onCambiar }) {
  if (clientes.length === 0) {
    return <p className="profe-vacio">No hay clientes para mostrar.</p>
  }
  return (
    <div className="lista-tarjetas">
      {clientes.map((cliente) => (
        <div key={cliente.id} className="codigo-item">
          <Link to={`/profe/clientes/${cliente.id}`} className="codigo-item-textos enlace-tabla">
            <strong>
              {cliente.nombre} {cliente.apellido}
            </strong>
            <small>{nombreDeProfe(cliente.profe_id)}</small>
          </Link>
          <select
            className="profe-calendario-select"
            value={cliente.profe_id || ''}
            onChange={(event) =>
              event.target.value &&
              onCambiar(
                'perfiles',
                cliente.id,
                { profe_id: event.target.value },
                'Cliente reasignado',
              )
            }
            aria-label={`Profe de ${cliente.nombre}`}
          >
            {!cliente.profe_id && <option value="">Sin profe</option>}
            {profes.map((profe) => (
              <option key={profe.id} value={profe.id}>
                {profe.nombre} {profe.apellido}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}

function filtrarPorNombre(lista, texto) {
  const buscado = texto.trim().toLowerCase()
  if (!buscado) return lista
  return lista.filter((persona) =>
    `${persona.nombre || ''} ${persona.apellido || ''}`.toLowerCase().includes(buscado),
  )
}
