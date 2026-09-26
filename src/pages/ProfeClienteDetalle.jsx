import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Pestanas from '../components/Pestanas.jsx'
import ListaRutinasCliente from '../components/ListaRutinasCliente.jsx'
import { supabase } from '../services/supabaseClient.js'
import {
  asignarDia,
  cargarCalendarioCliente,
  cargarRutinasDeCliente,
  diasPorRutina,
} from '../services/rutinas.js'
import {
  abrirComprobante,
  confirmarPago,
  estadoDeCuenta,
  habilitarCliente,
} from '../services/cuentas.js'
import { mostrarAviso } from '../services/avisos.js'
import { cargarPagos, TEXTO_ESTADO_PAGO } from '../services/pagos.js'
import { formatearPrecio, obtenerPlan } from '../data/planes.js'
import { DIAS_SEMANA, obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'
import { linkWhatsApp } from '../utils/whatsapp.js'

const PESTANAS = [
  { id: 'rutinas', label: 'Rutinas' },
  { id: 'semana', label: 'Semana' },
  { id: 'progreso', label: 'Progreso' },
  { id: 'pagos', label: 'Pagos' },
]

// Ficha del cliente: todo lo de esa persona en un solo lugar, en 4
// pestañas (Rutinas · Semana · Progreso · Pagos). La pestaña elegida
// queda en la dirección (?tab=semana), así se puede entrar directo.
export default function ProfeClienteDetalle() {
  const { id } = useParams()
  const [parametros, setParametros] = useSearchParams()
  const pestana = PESTANAS.some((item) => item.id === parametros.get('tab'))
    ? parametros.get('tab')
    : 'rutinas'

  const [cargando, setCargando] = useState(true)
  const [cliente, setCliente] = useState(null)
  const [rutinas, setRutinas] = useState([])
  const [cantidades, setCantidades] = useState({})
  const [calendario, setCalendario] = useState({})
  const [sesiones, setSesiones] = useState([])
  const [pagos, setPagos] = useState([])

  useEffect(() => {
    cargarTodo()
  }, [id])

  async function cargarTodo({ silencioso = false } = {}) {
    if (!silencioso) setCargando(true)
    const [{ data: perfil }, resultadoRutinas, { data: listaSesiones }, porDia, listaPagos] =
      await Promise.all([
        supabase.from('perfiles').select('*').eq('id', id).single(),
        cargarRutinasDeCliente(id),
        supabase
          .from('sesiones')
          .select('*, rutinas(nombre)')
          .eq('cliente_id', id)
          .order('fecha', { ascending: false })
          .limit(8),
        cargarCalendarioCliente(id),
        cargarPagos(id, 6),
      ])
    setCliente(perfil || null)
    setRutinas(resultadoRutinas.rutinas)
    setCantidades(resultadoRutinas.cantidades)
    setSesiones(listaSesiones || [])
    setCalendario(porDia)
    setPagos(listaPagos)
    setCargando(false)
  }

  function cambiarPestana(nueva) {
    setParametros({ tab: nueva }, { replace: true })
  }

  async function cambiarDia(dia, rutinaId) {
    const nombre = rutinas.find((rutina) => rutina.id === rutinaId)?.nombre
    setCalendario((actual) => ({
      ...actual,
      [dia]: {
        ...actual[dia],
        dia,
        rutina_id: rutinaId || null,
        rutinas: nombre ? { nombre } : null,
      },
    }))
    const error = await asignarDia(id, dia, rutinaId)
    mostrarAviso(
      error ? 'No pudimos guardar el día' : `${dia}: ${nombre || 'descanso'}`,
      error ? 'error' : 'ok',
    )
  }

  async function accionDePago(accion) {
    const error = await accion()
    if (error) {
      mostrarAviso('No pudimos guardar el cambio', 'error')
      return
    }
    mostrarAviso('Pago registrado')
    cargarTodo({ silencioso: true })
  }

  if (cargando || !cliente) {
    return (
      <ProfeLayout titulo="Cliente" volverA="/profe/clientes">
        <p className="profe-vacio">{cargando ? 'Cargando…' : 'No encontramos ese cliente.'}</p>
      </ProfeLayout>
    )
  }

  const nombreCompleto = `${cliente.nombre} ${cliente.apellido}`
  const estado = estadoDeCuenta(cliente, obtenerFechaHoyISO())
  const rutinasGuardadas = rutinas.filter((rutina) => rutina.publicada !== false)
  const whatsapp = linkWhatsApp(cliente.celular, `Hola ${cliente.nombre}!`)

  return (
    <ProfeLayout volverA="/profe/clientes">
      <header className="ficha-cabecera">
        <span className="inicio-avatar inicio-avatar-grande" aria-hidden="true">
          {`${cliente.nombre?.[0] || ''}${cliente.apellido?.[0] || ''}`.toUpperCase()}
        </span>
        <div className="ficha-datos">
          <h1 className="pagina-titulo pagina-titulo-sin-margen">{nombreCompleto}</h1>
          <p className="inicio-plan">
            {obtenerPlan(cliente.plan)?.nombre || cliente.plan || 'Sin plan'}
            {cliente.vencimiento ? ` · vence ${textoFechaCorta(cliente.vencimiento)}` : ''}
          </p>
        </div>
        <span className={`estado-chip estado-${estado.tono}`}>{estado.texto}</span>
      </header>

      <Pestanas
        etiqueta="Secciones del cliente"
        opciones={PESTANAS}
        activa={pestana}
        onCambiar={cambiarPestana}
      />

      <div className="ficha-contenido">
        {pestana === 'rutinas' && (
          <ListaRutinasCliente
            clienteId={id}
            clienteNombre={cliente.nombre}
            rutinas={rutinas}
            cantidades={cantidades}
            diasPorRutina={diasPorRutina(calendario)}
            onCambio={() => cargarTodo({ silencioso: true })}
          />
        )}

        {pestana === 'semana' && (
          <>
            <p className="profe-nota">Elegí qué rutina le toca cada día. Se guarda solo.</p>
            {rutinasGuardadas.length === 0 && (
              <p className="profe-vacio">
                Primero armale una rutina (pestaña Rutinas) y después elegí sus días acá.
              </p>
            )}
            <div className="lista-tarjetas">
              {DIAS_SEMANA.map((dia) => (
                <label key={dia} className="dia-fila">
                  <strong>{dia}</strong>
                  <select
                    className="profe-calendario-select"
                    value={calendario[dia]?.rutina_id || ''}
                    onChange={(event) => cambiarDia(dia, event.target.value || null)}
                  >
                    <option value="">Descanso</option>
                    {rutinasGuardadas.map((rutina) => (
                      <option key={rutina.id} value={rutina.id}>
                        {rutina.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </>
        )}

        {pestana === 'progreso' && (
          <>
            <Link to={`/profe/clientes/${id}/progreso`} className="boton-principal">
              Ver gráficas y resúmenes
            </Link>
            <Link to={`/profe/clientes/${id}/medidas`} className="boton-secundario ficha-medidas">
              Medidas y fotos (evaluación inicial)
            </Link>
            <p className="seccion-etiqueta">Últimos entrenamientos</p>
            {sesiones.length === 0 ? (
              <p className="profe-vacio">Todavía no completó ningún entrenamiento.</p>
            ) : (
              <div className="profe-progreso-lista">
                {sesiones.map((sesion) => (
                  <div key={sesion.id} className="profe-progreso-item">
                    <div className="profe-progreso-item-header">
                      <span className="profe-progreso-fecha">{textoFechaCorta(sesion.fecha)}</span>
                      <span className="profe-progreso-rutina">
                        {sesion.rutinas?.nombre || 'Rutina borrada'}
                      </span>
                      {sesion.esfuerzo && (
                        <span className="profe-progreso-esfuerzo">
                          Esfuerzo {sesion.esfuerzo}/5
                        </span>
                      )}
                    </div>
                    {sesion.comentario && (
                      <p className="profe-progreso-comentario">"{sesion.comentario}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="profe-nota">
              Si viene levantando fácil, subile el peso objetivo en su rutina (Rutinas → Editar).
            </p>
          </>
        )}

        {pestana === 'pagos' && (
          <>
            {cliente.baja_solicitada_en && (
              <div className="aviso-baja">
                <strong>
                  Pidió la baja de su cuenta el{' '}
                  {textoFechaCorta(cliente.baja_solicitada_en.slice(0, 10))}
                </strong>
                <span>
                  Por la Ley de datos personales hay que borrar su cuenta y sus datos. Hacelo desde
                  Supabase → Authentication → Users → buscá su email → "Delete user". Se borra
                  todo lo suyo (rutinas, entrenamientos, pagos).
                </span>
              </div>
            )}
            <dl className="ficha-datos-lista">
              <div>
                <dt>Plan</dt>
                <dd>{obtenerPlan(cliente.plan)?.nombre || cliente.plan || 'Sin plan'}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>{estado.texto}</dd>
              </div>
              <div>
                <dt>Vence</dt>
                <dd>
                  {cliente.vencimiento ? textoFechaCorta(cliente.vencimiento) : 'Sin definir'}
                </dd>
              </div>
              <div>
                <dt>Celular</dt>
                <dd>{cliente.celular || '—'}</dd>
              </div>
            </dl>
            <div className="acciones-columna">
              {cliente.estado === 'pendiente' ? (
                <button
                  type="button"
                  className="boton-principal"
                  onClick={() => accionDePago(() => habilitarCliente(id))}
                >
                  Habilitar cuenta
                </button>
              ) : (
                <button
                  type="button"
                  className={cliente.aviso_pago ? 'boton-principal' : 'boton-secundario'}
                  onClick={() => accionDePago(() => confirmarPago(id))}
                >
                  {cliente.aviso_pago ? 'Confirmar pago (+1 mes)' : 'Registrar un pago (+1 mes)'}
                </button>
              )}
              {cliente.comprobante_nombre && (
                <button
                  type="button"
                  className="boton-secundario"
                  onClick={async () => {
                    if (!(await abrirComprobante(cliente.comprobante_nombre))) {
                      mostrarAviso('No pudimos abrir el comprobante', 'error')
                    }
                  }}
                >
                  Ver comprobante
                </button>
              )}
              {whatsapp && (
                <a href={whatsapp} className="boton-secundario" target="_blank" rel="noreferrer">
                  Escribirle por WhatsApp
                </a>
              )}
            </div>
            {pagos.length > 0 && (
              <>
                <p className="seccion-etiqueta">Pagos</p>
                <div className="lista-tarjetas">
                  {pagos.map((pago) => (
                    <p key={pago.id} className="pago-fila">
                      <span>{textoFechaCorta(pago.creado_en.slice(0, 10))}</span>
                      <span>
                        {formatearPrecio(pago.monto)}
                        {pago.codigo ? ` · ${pago.codigo}` : ''}
                      </span>
                      <span className={`pago-estado pago-estado-${pago.estado}`}>
                        {TEXTO_ESTADO_PAGO[pago.estado] || pago.estado}
                      </span>
                    </p>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ProfeLayout>
  )
}
