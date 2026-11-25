import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Pestanas from '../components/Pestanas.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import Icono from '../components/Icono.jsx'
import { PANTALLA_COMPU, useCoincide } from '../components/useCoincide.js'
import AjustesPortada from '../components/AjustesPortada.jsx'
import AjustesDrive from '../components/AjustesDrive.jsx'
import AjustesDrey from '../components/AjustesDrey.jsx'
import { Campo, DatosDeCobroDelEspacio, PlanesDelEspacio } from '../components/CobroDeEspacio.jsx'
import { mostrarAviso } from '../services/avisos.js'
import { cargarConfiguracion, guardarAjustes, useConfiguracion } from '../services/configuracion.js'
import { cargarEspaciosAdmin } from '../services/suscripcionDrey.js'
import { listaDePlanes } from '../data/planes.js'

// Ajustes del negocio (solo el Admin). Todo se guarda en la base (tablas
// "planes" y "ajustes", supabase/sql/022) y la app lo usa al instante:
// no hace falta entrar a Supabase ni cambiar código. Cada cambio queda
// anotado en el Historial.
//
//   · Cobro de alumnos: cada profe y gimnasio cobra a sus alumnos con sus
//     planes y sus datos de cobro (supabase/sql/034). Los maneja cada
//     dueño desde Cobros; acá el Admin los puede ver y corregir, eligiendo
//     el espacio. Abajo, los datos para alumnos sin profe ni gimnasio.
//   · WhatsApp: link del grupo de la comunidad.
//   · Plazos: días de aviso antes del vencimiento y días de gracia.
//   · Portada: textos, secciones, foto del fundador y videos de la página
//     de inicio (components/AjustesPortada.jsx, supabase/sql/027).
//   · Drive: conexión con la carpeta de Google Drive donde se guardan las
//     evaluaciones de cada alumno (components/AjustesDrive.jsx, SQL 031).
//   · DREY: lo que cobra DREY a los profes y gimnasios: planes por cupos,
//     prueba gratis y datos de cobro de DREY (components/AjustesDrey.jsx,
//     SQL 032).
//
// Cómo se ve: en el celular, una lista de secciones (como los Ajustes
// del iPhone); cada fila abre su sección ("?tab=…") con "← Ajustes" para
// volver. En la compu, la misma lista queda fija a la izquierda como
// submenú y la sección elegida a la derecha. En la lista también están
// las Notificaciones (pantalla propia: pages/AdminNotificaciones.jsx,
// supabase/sql/030) y el Historial de cambios.
// Las secciones, en el orden de la lista. "to": abre otra pantalla.
const SECCIONES = [
  {
    id: 'notificaciones',
    label: 'Notificaciones',
    detalle: 'Qué avisos salen, a quién, a qué hora y con qué texto',
    to: '/profe/ajustes/notificaciones',
    icono: 'campana',
  },
  { id: 'cobro', label: 'Cobro de alumnos', detalle: 'Planes y datos de cobro', icono: 'pago' },
  { id: 'whatsapp', label: 'WhatsApp', detalle: 'Link del grupo de la comunidad', icono: 'chat' },
  {
    id: 'plazos',
    label: 'Plazos',
    detalle: 'Aviso antes de vencer y días de gracia',
    icono: 'reloj',
  },
  { id: 'drey', label: 'DREY', detalle: 'Planes por cupos y prueba gratis', icono: 'drey' },
  { id: 'portada', label: 'Portada', detalle: 'Textos, videos y fundador', icono: 'portada' },
  { id: 'drive', label: 'Drive', detalle: 'Carpeta de las evaluaciones', icono: 'nube' },
  {
    id: 'historial',
    label: 'Historial de cambios',
    detalle: 'Quién cambió qué y cuándo',
    to: '/profe/ajustes/historial',
    icono: 'historial',
  },
]
const SECCION_INICIAL = 'cobro'

export default function AdminAjustes() {
  const config = useConfiguracion()
  const [parametros, setParametros] = useSearchParams()
  const enCompu = useCoincide(PANTALLA_COMPU)
  const elegida = SECCIONES.find((item) => !item.to && item.id === parametros.get('tab'))
  // En el celular, sin sección elegida se ve solo la lista. En la compu
  // siempre hay una abierta (la primera, si no se eligió).
  const seccion =
    elegida || (enCompu ? SECCIONES.find((item) => item.id === SECCION_INICIAL) : null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    cargarConfiguracion().finally(() => setCargando(false))
  }, [])

  function abrir(id) {
    // En el celular, "Atrás" del teléfono vuelve a la lista.
    setParametros({ tab: id }, { replace: enCompu })
  }

  const lista = <ListaDeAjustes activa={seccion?.id} onAbrir={abrir} />

  return (
    <ProfeLayout titulo="Ajustes" soloAdmin>
      <div className={seccion ? 'ajustes-admin ajustes-admin-abierta' : 'ajustes-admin'}>
        {(enCompu || !seccion) && lista}

        {seccion && (
          <section className="ajustes-seccion" aria-labelledby="ajustes-seccion-titulo">
            {!enCompu && (
              <Link to="/profe/ajustes" className="ajustes-volver">
                ← Ajustes
              </Link>
            )}
            <h2 id="ajustes-seccion-titulo" className="ajustes-seccion-titulo">
              {seccion.label}
            </h2>
            {cargando ? <Esqueleto /> : <ContenidoDeSeccion id={seccion.id} config={config} />}
          </section>
        )}
      </div>
    </ProfeLayout>
  )
}

function ContenidoDeSeccion({ id, config }) {
  if (id === 'cobro') return <SeccionCobro config={config} />
  if (id === 'whatsapp') return <SeccionWhatsapp config={config} />
  if (id === 'portada') return <AjustesPortada />
  if (id === 'drive') return <AjustesDrive />
  if (id === 'drey') return <AjustesDrey config={config} />
  return <SeccionPlazos config={config} />
}

// La lista de secciones: cada fila con su ícono, nombre y una línea que
// explica qué hay adentro.
function ListaDeAjustes({ activa, onAbrir }) {
  return (
    <nav className="ajustes-lista" aria-label="Secciones de ajustes">
      {SECCIONES.map((item) => {
        const contenido = (
          <>
            <span className="ajustes-fila-icono">
              <Icono nombre={item.icono} tamano={20} />
            </span>
            <span className="ajustes-fila-textos">
              <strong>{item.label}</strong>
              <small>{item.detalle}</small>
            </span>
            <span className="ajustes-fila-flecha" aria-hidden="true">
              ›
            </span>
          </>
        )
        const clase = item.id === activa ? 'ajustes-fila ajustes-fila-activa' : 'ajustes-fila'
        return item.to ? (
          <Link key={item.id} to={item.to} className={clase}>
            {contenido}
          </Link>
        ) : (
          <button
            key={item.id}
            type="button"
            className={clase}
            onClick={() => onAbrir(item.id)}
            aria-current={item.id === activa ? 'page' : undefined}
          >
            {contenido}
          </button>
        )
      })}
    </nav>
  )
}

// Aviso según lo que respondió la base.
function avisarResultado(error, textoOk) {
  if (!error) {
    mostrarAviso(textoOk)
    return true
  }
  const faltaBase = /ajustes|link_mp|descripcion|does not exist|schema cache/i.test(
    error.message || '',
  )
  mostrarAviso(
    faltaBase
      ? 'Falta instalar la actualización de la base (SQL 022)'
      : 'No pudimos guardar. Probá de nuevo.',
    'error',
  )
  return false
}

// --- Cobro de alumnos -------------------------------------------------------

const PESTANAS_COBRO = [
  { id: 'planes', label: 'Planes' },
  { id: 'datos', label: 'Datos de cobro' },
]

function SeccionCobro({ config }) {
  const [espacios, setEspacios] = useState(null)
  const [elegido, setElegido] = useState('')
  const [parte, setParte] = useState('planes')

  useEffect(() => {
    cargarEspaciosAdmin().then(({ espacios: lista }) => {
      setEspacios(lista)
      // Arranca en el espacio con más planes (el de Facu, al principio).
      const conPlanes = [...lista].sort(
        (a, b) =>
          listaDePlanes({ espacioId: b.id }).length - listaDePlanes({ espacioId: a.id }).length,
      )
      setElegido((actual) => actual || conPlanes[0]?.id || '')
    })
  }, [])

  return (
    <>
      <p className="profe-nota">
        Cada profe y cada gimnasio cobra a sus alumnos: pone sus planes y sus datos de cobro desde
        su panel (Cobros). Acá los podés ver y corregir. Los alumnos ven los de su profe o gimnasio.
      </p>

      {espacios === null ? (
        <Esqueleto />
      ) : espacios.length === 0 ? (
        <p className="profe-vacio">Todavía no hay profes ni gimnasios.</p>
      ) : (
        <>
          <Campo etiqueta="Profe o gimnasio">
            <select
              className="auth-input"
              value={elegido}
              onChange={(event) => setElegido(event.target.value)}
            >
              {espacios.map((espacio) => (
                <option key={espacio.id} value={espacio.id}>
                  {espacio.nombre} ({espacio.codigo}) ·{' '}
                  {listaDePlanes({ espacioId: espacio.id }).length} planes
                </option>
              ))}
            </select>
          </Campo>
          <Pestanas
            etiqueta="Qué ver del espacio"
            opciones={PESTANAS_COBRO}
            activa={parte}
            onCambiar={setParte}
          />
          {elegido &&
            (parte === 'planes' ? (
              <PlanesDelEspacio key={elegido} espacioId={elegido} />
            ) : (
              <DatosDeCobroDelEspacio key={elegido} espacioId={elegido} />
            ))}
        </>
      )}

      <SinEspacio config={config} />
    </>
  )
}

// Datos para los alumnos de antes que no tienen profe ni gimnasio (los
// ven en Suscripción) y el estado del cobro automático.
function SinEspacio({ config }) {
  const [datos, setDatos] = useState(() => ({ ...config.transferencia }))
  const [guardando, setGuardando] = useState(false)
  const cambiado = ['banco', 'titular', 'cuenta', 'moneda'].some(
    (campo) => (datos[campo] || '') !== (config.transferencia[campo] || ''),
  )

  async function guardarTransferencia(event) {
    event.preventDefault()
    setGuardando(true)
    const error = await guardarAjustes({ transferencia: datos })
    setGuardando(false)
    avisarResultado(error, 'Datos para transferencia guardados')
  }

  return (
    <>
      <p className="profe-seccion-label">Alumnos sin profe ni gimnasio</p>
      <p className="profe-nota">
        Los ven solo los alumnos que todavía no tienen profe ni gimnasio, en Suscripción.
      </p>
      <form className="ajustes-tarjeta" onSubmit={guardarTransferencia}>
        {[
          ['banco', 'Banco', 'Ej. BROU'],
          ['titular', 'Titular', 'Nombre de quien recibe'],
          ['cuenta', 'Número de cuenta', 'Ej. 000123456-00001'],
          ['moneda', 'Moneda', 'Ej. Pesos'],
        ].map(([campo, etiqueta, ejemplo]) => (
          <Campo key={campo} etiqueta={etiqueta}>
            <input
              className="auth-input"
              type="text"
              value={datos[campo] || ''}
              placeholder={ejemplo}
              onChange={(event) =>
                setDatos((actual) => ({ ...actual, [campo]: event.target.value }))
              }
            />
          </Campo>
        ))}
        <button
          type="submit"
          className="boton-principal boton-chico"
          disabled={guardando || !cambiado}
        >
          {guardando ? 'Guardando…' : 'Guardar datos'}
        </button>
      </form>
    </>
  )
}

// --- WhatsApp ----------------------------------------------------------------

function SeccionWhatsapp({ config }) {
  const [link, setLink] = useState(config.whatsappGrupoUrl || '')
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function guardar(event) {
    event.preventDefault()
    const valor = link.trim()
    if (valor && !/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//i.test(valor)) {
      setMensaje('El link tiene que empezar con https://chat.whatsapp.com/')
      return
    }
    setMensaje('')
    setGuardando(true)
    const error = await guardarAjustes({ whatsappGrupoUrl: valor })
    setGuardando(false)
    avisarResultado(error, valor ? 'Link del grupo guardado' : 'Link del grupo borrado')
  }

  return (
    <>
      <p className="profe-seccion-label">Grupo de WhatsApp de la comunidad</p>
      <p className="profe-nota">
        En WhatsApp: abrí el grupo → tocá el nombre → "Invitar al grupo mediante enlace" → "Copiar
        enlace", y pegalo acá. Los clientes lo ven en Comunidad.
      </p>
      <form className="ajustes-tarjeta" onSubmit={guardar}>
        <Campo etiqueta="Link de invitación">
          <input
            className="auth-input"
            type="url"
            value={link}
            placeholder="https://chat.whatsapp.com/…"
            onChange={(event) => {
              setLink(event.target.value)
              setMensaje('')
            }}
          />
        </Campo>
        {mensaje && <p className="auth-message">{mensaje}</p>}
        <button
          type="submit"
          className="boton-principal boton-chico"
          disabled={guardando || link.trim() === (config.whatsappGrupoUrl || '')}
        >
          {guardando ? 'Guardando…' : 'Guardar link'}
        </button>
      </form>
    </>
  )
}

// --- Plazos ------------------------------------------------------------------

function SeccionPlazos({ config }) {
  const [diasAviso, setDiasAviso] = useState(String(config.diasAviso))
  const [diasDeGracia, setDiasDeGracia] = useState(String(config.diasDeGracia))
  const [diasAlumnosEspacio, setDiasAlumnosEspacio] = useState(
    String(config.diasAvisoAlumnosEspacio ?? 14),
  )
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const cambiado =
    diasAviso !== String(config.diasAviso) ||
    diasDeGracia !== String(config.diasDeGracia) ||
    diasAlumnosEspacio !== String(config.diasAvisoAlumnosEspacio ?? 14)

  async function guardar(event) {
    event.preventDefault()
    const valores = [Number(diasAviso), Number(diasDeGracia)]
    if (
      valores.some(
        (valor) =>
          diasAviso === '' ||
          diasDeGracia === '' ||
          !Number.isInteger(valor) ||
          valor < 0 ||
          valor > 30,
      )
    ) {
      setMensaje('Poné un número de días entre 0 y 30.')
      return
    }
    const diasEspacio = Number(diasAlumnosEspacio)
    if (
      diasAlumnosEspacio === '' ||
      !Number.isInteger(diasEspacio) ||
      diasEspacio < 0 ||
      diasEspacio > 60
    ) {
      setMensaje('Los días de los alumnos cuando el espacio no paga van de 0 a 60.')
      return
    }
    setMensaje('')
    setGuardando(true)
    const error = await guardarAjustes({
      diasAviso: valores[0],
      diasDeGracia: valores[1],
      // Sin el SQL 032 la base no tiene este dato: no se manda.
      ...(config.tieneCupos ? { diasAvisoAlumnosEspacio: diasEspacio } : {}),
    })
    setGuardando(false)
    avisarResultado(error, 'Plazos guardados')
  }

  return (
    <>
      <p className="profe-seccion-label">Vencimiento del plan</p>
      <form className="ajustes-tarjeta" onSubmit={guardar}>
        <Campo etiqueta="Avisar al cliente cuántos días antes de que venza">
          <input
            className="auth-input"
            type="number"
            min="0"
            max="30"
            inputMode="numeric"
            value={diasAviso}
            onChange={(event) => setDiasAviso(event.target.value)}
          />
        </Campo>
        <Campo etiqueta="Días de gracia (sigue entrenando después de vencer)">
          <input
            className="auth-input"
            type="number"
            min="0"
            max="30"
            inputMode="numeric"
            value={diasDeGracia}
            onChange={(event) => setDiasDeGracia(event.target.value)}
          />
        </Campo>
        <p className="profe-nota">
          Pasados los días de gracia sin pagar, el cliente deja de ver sus rutinas hasta que pague
          (su historial no se borra). El texto de los términos se actualiza solo.
        </p>
        <Campo etiqueta="Si un profe o gimnasio no le paga a DREY, días que sus alumnos siguen entrenando">
          <input
            className="auth-input"
            type="number"
            min="0"
            max="60"
            inputMode="numeric"
            value={diasAlumnosEspacio}
            onChange={(event) => setDiasAlumnosEspacio(event.target.value)}
          />
        </Campo>
        <p className="profe-nota">
          Durante esos días ven un cartel suave ("acercate a tu profe"), sin hablar de plata ni de
          DREY. Pasados, no ven sus rutinas hasta que su profe o gimnasio pague.
        </p>
        {mensaje && <p className="auth-message">{mensaje}</p>}
        <button
          type="submit"
          className="boton-principal boton-chico"
          disabled={guardando || !cambiado}
        >
          {guardando ? 'Guardando…' : 'Guardar plazos'}
        </button>
      </form>
    </>
  )
}
