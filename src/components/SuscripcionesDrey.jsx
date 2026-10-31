import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Esqueleto from './Esqueleto.jsx'
import BarraCupos from './BarraCupos.jsx'
import { mostrarAviso } from '../services/avisos.js'
import {
  METODOS_PAGO_DREY,
  abrirComprobanteDrey,
  cargarEspaciosAdmin,
  cargarPagosDrey,
  cargarPlanesDrey,
  registrarPagoDrey,
} from '../services/suscripcionDrey.js'
import { estadoDeEspacio } from '../data/vencimiento.js'
import { formatearPrecio } from '../data/planes.js'
import { obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'

// Admin → Pagos → "Suscripciones DREY" (supabase/sql/032): lo que los
// profes y gimnasios le pagan a DREY.
//
//   · Avisaron que pagaron: ver el comprobante y confirmar (aplica el plan
//     que eligieron y suma un mes).
//   · Por vencer o vencidos, en prueba, sin plan y al día.
//   · Los últimos pagos a DREY.
// Los cambios a mano (cupos, sin costo, pausar…) están en Equipo →
// Espacios.
export default function SuscripcionesDrey() {
  const [cargando, setCargando] = useState(true)
  const [espacios, setEspacios] = useState([])
  const [planes, setPlanes] = useState([])
  const [pagos, setPagos] = useState([])
  const [faltaBase, setFaltaBase] = useState(false)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const [{ espacios: lista, error }, { planes: listaPlanes }, { pagos: ultimos }] =
      await Promise.all([cargarEspaciosAdmin(), cargarPlanesDrey(), cargarPagosDrey(null, 15)])
    setEspacios(lista)
    setPlanes(listaPlanes)
    setPagos(ultimos)
    setFaltaBase(Boolean(error))
    setCargando(false)
  }

  if (cargando) return <Esqueleto />
  if (faltaBase) {
    return <p className="profe-vacio">Falta instalar la actualización de la base (SQL 032).</p>
  }

  const hoy = obtenerFechaHoyISO()
  const conEstado = espacios.map((espacio) => ({
    ...espacio,
    situacion: estadoDeEspacio(espacio, hoy),
  }))
  const grupos = [
    {
      titulo: 'Avisaron que pagaron',
      vacio: 'No hay avisos de pago de DREY.',
      lista: conEstado.filter((espacio) => espacio.avisoPago),
      confirmar: true,
    },
    {
      titulo: 'Por vencer o vencidos',
      lista: conEstado.filter(
        (espacio) =>
          !espacio.avisoPago &&
          ['por-vencer', 'gracia', 'vencido'].includes(espacio.situacion.tipo),
      ),
      confirmar: true,
    },
    {
      titulo: 'Sin plan o prueba terminada',
      lista: conEstado.filter(
        (espacio) =>
          !espacio.avisoPago && ['pendiente', 'prueba-terminada'].includes(espacio.situacion.tipo),
      ),
      confirmar: true,
    },
    {
      titulo: 'En prueba gratis',
      lista: conEstado.filter(
        (espacio) => !espacio.avisoPago && espacio.situacion.tipo === 'prueba',
      ),
    },
    {
      titulo: 'Al día',
      lista: conEstado.filter(
        (espacio) => !espacio.avisoPago && espacio.situacion.tipo === 'al-dia',
      ),
    },
    {
      titulo: 'Sin costo o pausados',
      lista: conEstado.filter(
        (espacio) =>
          !espacio.avisoPago && ['sin-costo', 'pausado'].includes(espacio.situacion.tipo),
      ),
    },
  ]
  const nombreDeEspacio = (id) => espacios.find((espacio) => espacio.id === id)?.nombre
  const nombreDePlan = (id) => planes.find((plan) => plan.id === id)?.nombre || id || '—'

  return (
    <>
      <p className="profe-nota">
        Lo que los profes y gimnasios le pagan a DREY por sus cupos de alumnos. Para cambiar cupos,
        marcar sin costo o pausar un espacio, andá a{' '}
        <Link to="/profe/equipo?tab=espacios" className="enlace-tabla">
          Equipo → Espacios
        </Link>
        .
      </p>

      {grupos.map((grupo) =>
        grupo.lista.length === 0 && !grupo.vacio ? null : (
          <section key={grupo.titulo}>
            <p className="profe-seccion-label">
              {grupo.titulo} {grupo.lista.length > 0 && `(${grupo.lista.length})`}
            </p>
            {grupo.lista.length === 0 ? (
              <p className="profe-vacio">{grupo.vacio}</p>
            ) : (
              <div className="lista-tarjetas">
                {grupo.lista.map((espacio) => (
                  <TarjetaSuscripcion
                    key={espacio.id}
                    espacio={espacio}
                    planes={planes}
                    conConfirmar={grupo.confirmar}
                    onListo={cargar}
                  />
                ))}
              </div>
            )}
          </section>
        ),
      )}

      {pagos.length > 0 && (
        <>
          <p className="profe-seccion-label">Últimos pagos a DREY</p>
          <div className="profe-tabla-wrap">
            <table className="profe-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Espacio</th>
                  <th>Plan</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((pago) => (
                  <tr key={pago.id}>
                    <td>{textoFechaCorta(pago.creado_en)}</td>
                    <td>{nombreDeEspacio(pago.espacio_id) || pago.espacio_nombre || '—'}</td>
                    <td>{nombreDePlan(pago.plan)}</td>
                    <td>
                      {formatearPrecio(pago.monto)}
                      <small className="pago-metodo">
                        {METODOS_PAGO_DREY[pago.metodo] || pago.metodo}
                        {pago.periodo_hasta
                          ? ` · hasta ${textoFechaCorta(pago.periodo_hasta)}`
                          : ''}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

// Un espacio con su suscripción y, si corresponde, el formulario para
// confirmar un pago.
function TarjetaSuscripcion({ espacio, planes, conConfirmar, onListo }) {
  const planAPagar = planes.find((plan) => plan.id === (espacio.planPedido || espacio.planDrey))
  const primerPago = !espacio.vencimiento && espacio.estado !== 'activo'
  const precio =
    planAPagar &&
    (primerPago && planAPagar.precioPrimerMes != null
      ? planAPagar.precioPrimerMes
      : planAPagar.precioMensual)
  const [abierto, setAbierto] = useState(false)
  const [monto, setMonto] = useState(precio != null ? String(precio) : '')
  const [metodo, setMetodo] = useState('transferencia')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function confirmar(event) {
    event.preventDefault()
    if (monto.trim() !== '' && (!Number.isInteger(Number(monto)) || Number(monto) < 0)) {
      mostrarAviso('Poné el monto en pesos, sin puntos ni decimales.', 'error')
      return
    }
    setGuardando(true)
    const { datos, error } = await registrarPagoDrey(espacio.id, { monto, metodo, nota })
    setGuardando(false)
    if (error) {
      mostrarAviso(
        error.message?.includes('no eligió')
          ? 'Ese espacio todavía no eligió un plan DREY: asignale uno en Equipo → Espacios.'
          : 'No pudimos confirmar el pago. Probá de nuevo.',
        'error',
      )
      return
    }
    mostrarAviso(
      `Pago confirmado: ${datos?.plan || 'plan'} hasta el ${textoFechaCorta(datos?.vencimiento)}`,
    )
    setAbierto(false)
    onListo?.()
  }

  async function verComprobante() {
    if (!(await abrirComprobanteDrey(espacio.comprobante))) {
      mostrarAviso('No pudimos abrir el comprobante', 'error')
    }
  }

  return (
    <div className="espacio-admin">
      <div className="espacio-admin-cabecera">
        <div className="codigo-item-textos">
          <strong>
            {espacio.nombre} <small>· {espacio.codigo}</small>
          </strong>
          <small>
            {espacio.tipo === 'gimnasio' ? 'Gimnasio' : 'Profe'}
            {espacio.dueno ? ` · ${espacio.dueno}` : ''}
            {espacio.duenoCelular ? ` · ${espacio.duenoCelular}` : ''}
          </small>
          <small>
            {espacio.planNombre ? `Plan ${espacio.planNombre}` : 'Sin plan'}
            {espacio.pedidoNombre ? ` · eligió ${espacio.pedidoNombre}` : ''}
            {espacio.vencimiento ? ` · vence ${textoFechaCorta(espacio.vencimiento)}` : ''}
          </small>
        </div>
        <span className={`estado-chip estado-${espacio.situacion.tono}`}>
          {espacio.avisoPago ? 'Avisó pago' : espacio.situacion.texto}
        </span>
      </div>

      <BarraCupos total={espacio.cuposTotal} usados={espacio.cuposUsados} />

      <div className="espacio-admin-acciones">
        {espacio.comprobante && (
          <button type="button" className="profe-ver-comprobante" onClick={verComprobante}>
            Ver comprobante
          </button>
        )}
        {conConfirmar && !abierto && (
          <button
            type="button"
            className={
              espacio.avisoPago ? 'boton-principal boton-chico' : 'boton-secundario boton-chico'
            }
            onClick={() => setAbierto(true)}
          >
            {espacio.avisoPago ? 'Confirmar pago' : 'Registrar un pago'}
          </button>
        )}
      </div>

      {abierto && (
        <form className="ajustes-tarjeta" onSubmit={confirmar}>
          <p className="profe-nota">
            {planAPagar
              ? `Se aplica el plan ${planAPagar.nombre} (${planAPagar.cupos} alumnos) y se suma un mes.`
              : 'Este espacio no eligió plan: asignale uno en Equipo → Espacios antes de confirmar.'}
          </p>
          <div className="codigo-fila">
            <label className="ajustes-campo">
              <span>Monto ($U)</span>
              <input
                className="auth-input"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={monto}
                onChange={(event) => setMonto(event.target.value)}
              />
            </label>
            <label className="ajustes-campo">
              <span>Cómo pagó</span>
              <select
                className="auth-input"
                value={metodo}
                onChange={(event) => setMetodo(event.target.value)}
              >
                {Object.entries(METODOS_PAGO_DREY).map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="ajustes-campo">
            <span>Nota (opcional)</span>
            <input
              className="auth-input"
              type="text"
              value={nota}
              onChange={(event) => setNota(event.target.value)}
              placeholder="Ej. pagó en efectivo"
            />
          </label>
          <div className="codigo-fila">
            <button
              type="button"
              className="boton-secundario boton-chico"
              onClick={() => setAbierto(false)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="boton-principal boton-chico"
              disabled={guardando || !planAPagar}
            >
              {guardando ? 'Confirmando…' : 'Confirmar (+1 mes)'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
