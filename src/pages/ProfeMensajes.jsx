import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { clientesDelEspacio } from '../services/espacio.js'
import { obtenerUsuarioActual } from '../services/sesion.js'
import { mostrarAviso } from '../services/avisos.js'
import {
  MAXIMO_LETRAS_MENSAJE,
  borrarMensaje,
  cargarMisMensajes,
  publicarMensaje,
} from '../services/mensajesProfe.js'
import { FIESTAS, proximaFechaDe } from '../data/fiestas.js'
import { estadoDeMensaje } from '../utils/mensajesDelDia.js'
import { obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'

const TEXTO_ESTADO = {
  hoy: { texto: 'Se está mostrando', clase: 'estado-ok' },
  programado: { texto: 'Programado', clase: 'estado-alerta' },
  terminado: { texto: 'Ya pasó', clase: 'estado-neutro' },
}

const EJEMPLOS = [
  'Hoy es un gran día, mente activa.',
  'Si superás la carga en sentadilla, tenemos un premio para vos.',
  'Hoy te ganaste un descuento en DREY.',
]

// "Mensajes a mis alumnos" (panel del profe → Clientes): el profe escribe
// un mensaje grande que el alumno ve al abrir la app, una vez por día,
// los días que elija. Para todos sus alumnos o para uno solo.
//
// Sirve también para el saludo de las fiestas: los botones "Navidad",
// "Fin de año" y "Año Nuevo" ponen la fecha y un texto para arrancar; ese
// día el alumno lo ve con el diseño de la fiesta. Si el profe no programa
// nada, igual sale un saludo con su nombre (data/fiestas.js).
//
// Con ?cliente=<id> (desde la ficha de un alumno) ya viene elegido.
// Base: supabase/sql/037. Servicio: services/mensajesProfe.js.
export default function ProfeMensajes() {
  const hoy = obtenerFechaHoyISO()
  const [parametros] = useSearchParams()
  const [cargando, setCargando] = useState(true)
  const [clientes, setClientes] = useState([])
  const [mensajes, setMensajes] = useState([])
  const [faltaInstalar, setFaltaInstalar] = useState(false)

  const [clienteId, setClienteId] = useState(parametros.get('cliente') || '')
  const [texto, setTexto] = useState('')
  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(hoy)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const usuario = await obtenerUsuarioActual()
    const [{ data: lista }, resultado] = await Promise.all([
      clientesDelEspacio('id, nombre, apellido').eq('estado', 'activo').order('nombre'),
      cargarMisMensajes(usuario?.id),
    ])
    setClientes(lista || [])
    setMensajes(resultado.mensajes)
    setFaltaInstalar(Boolean(resultado.error))
    setCargando(false)
  }

  // Un botón de fiesta: pone el día y, si no escribió nada, un texto.
  function elegirFiesta(fiesta) {
    const fecha = proximaFechaDe(fiesta, hoy)
    setDesde(fecha)
    setHasta(fecha)
    if (!texto.trim()) setTexto(`${fiesta.titulo} ${fiesta.saludo}`)
  }

  function cambiarDesde(valor) {
    setDesde(valor)
    if (valor > hasta) setHasta(valor)
  }

  async function publicar(event) {
    event.preventDefault()
    if (guardando) return
    if (!texto.trim()) {
      setError('Escribí el mensaje.')
      return
    }
    if (!desde || !hasta || hasta < desde) {
      setError('Revisá las fechas: "Hasta" no puede ser antes que "Desde".')
      return
    }
    if (hasta < hoy) {
      setError('Esas fechas ya pasaron: elegí hoy o un día que venga.')
      return
    }
    setGuardando(true)
    setError('')
    const resultado = await publicarMensaje({ clienteId, texto, desde, hasta })
    setGuardando(false)
    if (resultado.error) {
      setError('No pudimos publicar el mensaje. Probá de nuevo.')
      return
    }
    setMensajes((lista) => [resultado.mensaje, ...lista])
    setTexto('')
    mostrarAviso(desde > hoy ? 'Mensaje programado ✓' : 'Mensaje publicado ✓')
  }

  async function borrar(mensaje) {
    if (!window.confirm('¿Borrar este mensaje? Los alumnos dejan de verlo.')) return
    if (await borrarMensaje(mensaje.id)) {
      mostrarAviso('No pudimos borrar el mensaje', 'error')
      return
    }
    setMensajes((lista) => lista.filter((otro) => otro.id !== mensaje.id))
    mostrarAviso('Mensaje borrado')
  }

  const vigentes = useMemo(
    () => mensajes.filter((mensaje) => estadoDeMensaje(mensaje, hoy) !== 'terminado'),
    [mensajes, hoy],
  )
  const pasados = useMemo(
    () => mensajes.filter((mensaje) => estadoDeMensaje(mensaje, hoy) === 'terminado'),
    [mensajes, hoy],
  )
  const letras = texto.length

  return (
    <ProfeLayout titulo="Mensajes a mis alumnos">
      <Link to="/profe/clientes" className="boton-texto mensajes-volver">
        ← Volver a Clientes
      </Link>
      <p className="profe-nota">
        Escribí un mensaje y tus alumnos lo ven bien grande al abrir la app, una vez por día. Puede
        ser para todos o para uno solo.
      </p>

      {faltaInstalar && (
        <p className="auth-message" role="alert">
          Falta activar los mensajes en la base de datos (SQL 037 de Supabase).
        </p>
      )}

      <form className="mensajes-formulario" onSubmit={publicar}>
        <label className="editor-campo editor-campo-ancho">
          <span>Para</span>
          <select
            className="profe-calendario-select"
            value={clienteId}
            onChange={(event) => setClienteId(event.target.value)}
          >
            <option value="">Todos mis alumnos</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre} {cliente.apellido}
              </option>
            ))}
          </select>
        </label>

        <label className="editor-campo editor-campo-ancho">
          <span>
            Mensaje ({letras}/{MAXIMO_LETRAS_MENSAJE})
          </span>
          <textarea
            className="form-textarea"
            placeholder={`Ej: ${EJEMPLOS[0]}`}
            maxLength={MAXIMO_LETRAS_MENSAJE}
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
          />
        </label>
        <div className="chips-lista">
          {EJEMPLOS.map((ejemplo) => (
            <button key={ejemplo} type="button" className="chip" onClick={() => setTexto(ejemplo)}>
              {ejemplo}
            </button>
          ))}
        </div>

        <div className="mensajes-fechas">
          <label className="editor-campo">
            <span>Desde</span>
            <input
              className="auth-input"
              type="date"
              min={hoy}
              value={desde}
              onChange={(event) => cambiarDesde(event.target.value)}
            />
          </label>
          <label className="editor-campo">
            <span>Hasta (incluido)</span>
            <input
              className="auth-input"
              type="date"
              min={desde || hoy}
              value={hasta}
              onChange={(event) => setHasta(event.target.value)}
            />
          </label>
        </div>

        <div className="mensajes-fiestas">
          <span className="editor-rango-etiqueta">Saludo de las fiestas</span>
          <div className="chips-lista">
            {FIESTAS.map((fiesta) => (
              <button
                key={fiesta.id}
                type="button"
                className="chip"
                onClick={() => elegirFiesta(fiesta)}
              >
                {fiesta.nombre} ({textoFechaCorta(proximaFechaDe(fiesta, hoy))})
              </button>
            ))}
          </div>
          <p className="profe-nota">
            Esos días la app se viste de fiesta (arbolito en Navidad, fuegos artificiales en fin de
            año) y tus alumnos ven tu saludo. Si no programás nada, igual les sale un saludo con tu
            nombre.
          </p>
        </div>

        {error && (
          <p className="auth-message" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="boton-principal" disabled={guardando}>
          {guardando ? 'Publicando…' : desde > hoy ? 'Programar mensaje' : 'Publicar mensaje'}
        </button>
      </form>

      <p className="profe-seccion-label">Activos y programados</p>
      {cargando ? (
        <Esqueleto filas={2} />
      ) : vigentes.length === 0 ? (
        <p className="profe-vacio">No hay ningún mensaje activo ni programado.</p>
      ) : (
        <ListaDeMensajes mensajes={vigentes} hoy={hoy} onBorrar={borrar} />
      )}

      {pasados.length > 0 && (
        <details className="mensajes-pasados">
          <summary>Mensajes que ya pasaron ({pasados.length})</summary>
          <ListaDeMensajes mensajes={pasados} hoy={hoy} onBorrar={borrar} />
        </details>
      )}
    </ProfeLayout>
  )
}

function ListaDeMensajes({ mensajes, hoy, onBorrar }) {
  return (
    <div className="lista-tarjetas">
      {mensajes.map((mensaje) => {
        const estado = TEXTO_ESTADO[estadoDeMensaje(mensaje, hoy)]
        const alumno = mensaje.perfiles
          ? `${mensaje.perfiles.nombre || ''} ${mensaje.perfiles.apellido || ''}`.trim()
          : ''
        return (
          <div key={mensaje.id} className="mensaje-tarjeta">
            <p className="mensaje-tarjeta-texto">“{mensaje.texto}”</p>
            <p className="mensaje-tarjeta-datos">
              <span className={`estado-chip estado-chip-chico ${estado.clase}`}>{estado.texto}</span>
              <span>Para: {mensaje.cliente_id ? alumno || 'un alumno' : 'todos mis alumnos'}</span>
              <span>
                {mensaje.desde === mensaje.hasta
                  ? textoFechaCorta(mensaje.desde)
                  : `${textoFechaCorta(mensaje.desde)} al ${textoFechaCorta(mensaje.hasta)}`}
              </span>
            </p>
            <button
              type="button"
              className="boton-texto boton-texto-peligro mensaje-tarjeta-borrar"
              onClick={() => onBorrar(mensaje)}
            >
              Borrar
            </button>
          </div>
        )
      })}
    </div>
  )
}
