import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Esqueleto from './Esqueleto.jsx'
import BarraCupos from './BarraCupos.jsx'
import { mostrarAviso } from '../services/avisos.js'
import {
  borrarEspacio,
  cargarEspaciosAdmin,
  cargarPlanesDrey,
  guardarEspacio,
  textoErrorEspacio,
} from '../services/suscripcionDrey.js'
import { estadoDeEspacio } from '../data/vencimiento.js'
import { obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'
import { normalizarTexto } from '../utils/texto.js'

// Admin → Equipo → "Espacios" (supabase/sql/032): cada profe y cada
// gimnasio con su suscripción DREY. El Admin puede, a mano:
//   · cambiar el plan, sumar cupos extra o marcarlo "sin costo" (con o
//     sin tope de alumnos), como Facu;
//   · dejar que los profes de un gimnasio habiliten alumnos;
//   · cambiar el estado (prueba, pendiente, al día, pausado) y las fechas;
//   · cambiar el nombre o el código;
//   · borrarlo (sus alumnos quedan sin espacio, nada más se borra).
// Cada cambio queda en el Historial. Los pagos se confirman en Pagos →
// Suscripciones DREY.
const ESTADOS = {
  prueba: 'En prueba',
  pendiente: 'Pendiente (sin plan)',
  activo: 'Activo (pagó)',
  pausado: 'Pausado',
}

export default function AdminEspacios() {
  const [cargando, setCargando] = useState(true)
  const [espacios, setEspacios] = useState([])
  const [planes, setPlanes] = useState([])
  const [faltaBase, setFaltaBase] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const [{ espacios: lista, error }, { planes: listaPlanes }] = await Promise.all([
      cargarEspaciosAdmin(),
      cargarPlanesDrey(),
    ])
    setEspacios(lista)
    setPlanes(listaPlanes)
    setFaltaBase(Boolean(error))
    setCargando(false)
  }

  const filtrados = useMemo(() => {
    const texto = normalizarTexto(busqueda.trim())
    if (!texto) return espacios
    return espacios.filter((espacio) =>
      normalizarTexto(
        `${espacio.nombre} ${espacio.codigo} ${espacio.dueno} ${espacio.duenoEmail}`,
      ).includes(texto),
    )
  }, [espacios, busqueda])

  if (cargando) return <Esqueleto />
  if (faltaBase) {
    return <p className="profe-vacio">Falta instalar la actualización de la base (SQL 032).</p>
  }

  const hoy = obtenerFechaHoyISO()

  return (
    <>
      <p className="profe-nota">
        Cada profe tiene su espacio (sus alumnos particulares) y cada gimnasio el suyo. Los pagos a
        DREY se confirman en{' '}
        <Link to="/profe/cuentas?tab=drey" className="enlace-tabla">
          Pagos → Suscripciones DREY
        </Link>
        .
      </p>
      <input
        className="auth-input espacio-admin-buscar"
        type="search"
        placeholder="Buscar por nombre, código o dueño"
        value={busqueda}
        onChange={(event) => setBusqueda(event.target.value)}
      />
      <p className="profe-seccion-label">Espacios ({filtrados.length})</p>
      <div className="lista-tarjetas">
        {filtrados.map((espacio) => {
          const situacion = estadoDeEspacio(espacio, hoy)
          return (
            <div key={espacio.id} className="espacio-admin">
              <div className="espacio-admin-cabecera">
                <div className="codigo-item-textos">
                  <strong>
                    {espacio.nombre} <small>· {espacio.codigo}</small>
                  </strong>
                  <small>
                    {espacio.tipo === 'gimnasio' ? 'Gimnasio' : 'Profe'}
                    {espacio.dueno ? ` · ${espacio.dueno}` : ' · sin dueño'}
                    {espacio.duenoEmail ? ` · ${espacio.duenoEmail}` : ''}
                  </small>
                  <small>
                    {espacio.sinCosto
                      ? 'Sin costo'
                      : espacio.planNombre
                        ? `Plan ${espacio.planNombre}`
                        : 'Sin plan'}
                    {espacio.cuposExtra > 0 ? ` · +${espacio.cuposExtra} cupos extra` : ''}
                    {espacio.tipo === 'gimnasio' &&
                      ` · ${espacio.profes} ${espacio.profes === 1 ? 'persona' : 'personas'} en el equipo`}
                  </small>
                </div>
                <span className={`estado-chip estado-${situacion.tono}`}>{situacion.texto}</span>
              </div>
              <BarraCupos total={espacio.cuposTotal} usados={espacio.cuposUsados} />
              {editando === espacio.id ? (
                <EditorEspacio
                  espacio={espacio}
                  planes={planes}
                  onCerrar={() => setEditando(null)}
                  onGuardado={() => {
                    setEditando(null)
                    cargar()
                  }}
                />
              ) : (
                <div className="espacio-admin-acciones">
                  <button
                    type="button"
                    className="boton-secundario boton-chico"
                    onClick={() => setEditando(espacio.id)}
                  >
                    Editar
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function EditorEspacio({ espacio, planes, onCerrar, onGuardado }) {
  const inicial = {
    nombre: espacio.nombre,
    codigo: espacio.codigo,
    planDrey: espacio.planDrey || '',
    cuposExtra: String(espacio.cuposExtra ?? 0),
    sinCosto: espacio.sinCosto,
    cuposSinCosto: espacio.cuposSinCosto == null ? '' : String(espacio.cuposSinCosto),
    profesHabilitan: espacio.profesHabilitan,
    estado: espacio.estado,
    pruebaHasta: espacio.pruebaHasta || '',
    vencimiento: espacio.vencimiento || '',
  }
  const [formulario, setFormulario] = useState(inicial)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [borrando, setBorrando] = useState(false)

  function cambiar(campo, valor) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }))
    setMensaje('')
  }

  async function guardar(event) {
    event.preventDefault()
    const problema = revisar(formulario)
    if (problema) {
      setMensaje(problema)
      return
    }
    // Solo se manda lo que cambió (así el Historial anota solo eso).
    const cambios = Object.fromEntries(
      Object.entries(formulario).filter(([campo, valor]) => valor !== inicial[campo]),
    )
    if (Object.keys(cambios).length === 0) {
      onCerrar()
      return
    }
    setGuardando(true)
    const error = await guardarEspacio(espacio.id, cambios)
    setGuardando(false)
    if (error) {
      setMensaje(textoErrorEspacio(error))
      return
    }
    mostrarAviso('Espacio guardado')
    onGuardado()
  }

  async function borrar() {
    setGuardando(true)
    const error = await borrarEspacio(espacio.id)
    setGuardando(false)
    if (error) {
      setMensaje('No pudimos borrarlo. Probá de nuevo.')
      return
    }
    mostrarAviso('Espacio borrado')
    onGuardado()
  }

  return (
    <form className="ajustes-tarjeta" onSubmit={guardar}>
      <div className="codigo-fila">
        <Campo etiqueta="Nombre">
          <input
            className="auth-input"
            type="text"
            value={formulario.nombre}
            onChange={(event) => cambiar('nombre', event.target.value)}
          />
        </Campo>
        <Campo etiqueta="Código">
          <input
            className="auth-input"
            type="text"
            value={formulario.codigo}
            onChange={(event) => cambiar('codigo', event.target.value.toUpperCase())}
            maxLength={20}
          />
        </Campo>
      </div>

      <label className="form-checkbox-row">
        <input
          type="checkbox"
          checked={formulario.sinCosto}
          onChange={(event) => cambiar('sinCosto', event.target.checked)}
        />
        <span>Sin costo (no le paga a DREY)</span>
      </label>

      {formulario.sinCosto ? (
        <Campo etiqueta="Alumnos que puede tener (vacío = sin tope)">
          <input
            className="auth-input"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={formulario.cuposSinCosto}
            onChange={(event) => cambiar('cuposSinCosto', event.target.value)}
          />
        </Campo>
      ) : (
        <Campo etiqueta="Plan DREY">
          <select
            className="auth-input"
            value={formulario.planDrey}
            onChange={(event) => cambiar('planDrey', event.target.value)}
          >
            <option value="">Sin plan</option>
            {planes.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.nombre} · {plan.cupos} alumnos{plan.activo ? '' : ' (oculto)'}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <Campo etiqueta="Cupos extra (se suman al plan)">
        <input
          className="auth-input"
          type="number"
          min="0"
          step="1"
          inputMode="numeric"
          value={formulario.cuposExtra}
          onChange={(event) => cambiar('cuposExtra', event.target.value)}
        />
      </Campo>

      {espacio.tipo === 'gimnasio' && (
        <label className="form-checkbox-row">
          <input
            type="checkbox"
            checked={formulario.profesHabilitan}
            onChange={(event) => cambiar('profesHabilitan', event.target.checked)}
          />
          <span>
            Los profes del gimnasio también pueden habilitar alumnos (al dueño le llega aviso)
          </span>
        </label>
      )}

      <Campo etiqueta="Estado">
        <select
          className="auth-input"
          value={formulario.estado}
          onChange={(event) => cambiar('estado', event.target.value)}
        >
          {Object.entries(ESTADOS).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
      </Campo>
      <div className="codigo-fila">
        {formulario.estado === 'prueba' && (
          <Campo etiqueta="Prueba hasta">
            <input
              className="auth-input"
              type="date"
              value={formulario.pruebaHasta}
              onChange={(event) => cambiar('pruebaHasta', event.target.value)}
            />
          </Campo>
        )}
        {formulario.estado === 'activo' && (
          <Campo etiqueta="Vence">
            <input
              className="auth-input"
              type="date"
              value={formulario.vencimiento}
              onChange={(event) => cambiar('vencimiento', event.target.value)}
            />
          </Campo>
        )}
      </div>

      {mensaje && <p className="auth-message">{mensaje}</p>}

      <div className="codigo-fila">
        <button type="button" className="boton-secundario boton-chico" onClick={onCerrar}>
          Cancelar
        </button>
        <button type="submit" className="boton-principal boton-chico" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>

      {borrando ? (
        <div className="aviso-baja">
          <strong>¿Borrar {espacio.nombre}?</strong>
          <span>
            Sus {espacio.cuposUsados} alumnos quedan sin espacio (no se borra ninguna cuenta ni sus
            rutinas).{' '}
            {espacio.tipo === 'gimnasio'
              ? 'El gimnasio sigue existiendo: si después se le cambia el nombre o el dueño, se le crea un espacio nuevo en prueba.'
              : ''}
          </span>
          <div className="equipo-confirmar">
            <button
              type="button"
              className="boton-principal boton-chico"
              onClick={borrar}
              disabled={guardando}
            >
              Sí, borrar
            </button>
            <button
              type="button"
              className="boton-secundario boton-chico"
              onClick={() => setBorrando(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="boton-texto" onClick={() => setBorrando(true)}>
          Borrar este espacio
        </button>
      )}
      {espacio.pruebaHasta && formulario.estado !== 'prueba' && (
        <p className="profe-nota">La prueba era hasta el {textoFechaCorta(espacio.pruebaHasta)}.</p>
      )}
    </form>
  )
}

// Devuelve el problema a corregir, o '' si está todo bien.
function revisar(formulario) {
  if (!formulario.nombre.trim()) return 'Poné un nombre.'
  if (!/^[A-Z0-9]{4,20}$/.test(formulario.codigo.trim())) {
    return 'El código va de 4 a 20 letras o números, sin espacios ni tildes.'
  }
  for (const [campo, texto] of [
    ['cuposExtra', 'Los cupos extra'],
    ['cuposSinCosto', 'Los alumnos sin costo'],
  ]) {
    const valor = String(formulario[campo] ?? '').trim()
    if (valor !== '' && (!Number.isInteger(Number(valor)) || Number(valor) < 0)) {
      return `${texto} van en números enteros (ej. 5).`
    }
  }
  if (formulario.estado === 'activo' && !formulario.sinCosto && !formulario.planDrey) {
    return 'Para dejarlo activo, elegile un plan DREY (o marcalo sin costo).'
  }
  return ''
}

function Campo({ etiqueta, children }) {
  return (
    <label className="ajustes-campo">
      <span>{etiqueta}</span>
      {children}
    </label>
  )
}
