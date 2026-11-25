import { useEffect, useMemo, useState } from 'react'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { cargarHistorial } from '../services/configuracion.js'
import Chips from '../components/Chips.jsx'
import { fechaLocalISO, obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'
import { filtrarHistorial, PERIODOS_HISTORIAL } from '../utils/historial.js'

// Historial de cambios del Admin (tabla "historial_admin",
// supabase/sql/022). La base anota sola cada cambio que hace el Admin:
// precios y planes, ajustes, profes, gimnasios, clientes reasignados y
// pagos confirmados. También quién archiva, recupera o borra ejercicios
// de la Biblioteca, sea profe o Admin (supabase/sql/024), y los cambios
// de la página de inicio (supabase/sql/027), de las notificaciones
// (supabase/sql/030) y del cobro por cupos: planes y pagos DREY y cambios
// de espacios (supabase/sql/032). Acá se ven los
// últimos 500, agrupados por día, con filtros (utils/historial.js): por
// tipo de cambio, por período (hoy · 7 días · 30 días · todo) y por texto
// (un nombre, un plan, un código).
const TIPOS = {
  plan: 'Planes',
  ajustes: 'Ajustes',
  profe: 'Profes',
  cliente: 'Clientes',
  gimnasio: 'Gimnasios',
  pago: 'Pagos',
  biblioteca: 'Biblioteca',
  pagina: 'Página de inicio',
  avisos: 'Notificaciones',
  drey: 'Suscripciones DREY',
  espacio: 'Espacios',
}

export default function AdminHistorial() {
  const [cargando, setCargando] = useState(true)
  const [filas, setFilas] = useState([])
  const [error, setError] = useState(false)
  const [tipo, setTipo] = useState('')
  const [periodo, setPeriodo] = useState('')
  const [texto, setTexto] = useState('')

  useEffect(() => {
    cargarHistorial(500).then((resultado) => {
      setFilas(resultado.filas)
      setError(Boolean(resultado.error))
      setCargando(false)
    })
  }, [])

  const porDia = useMemo(() => {
    const grupos = new Map()
    const filtradas = filtrarHistorial(filas, { tipo, periodo, texto, hoy: obtenerFechaHoyISO() })
    for (const fila of filtradas) {
      const fecha = new Date(fila.creado_en)
      const dia = fechaLocalISO(fecha)
      if (!grupos.has(dia)) grupos.set(dia, [])
      grupos.get(dia).push({
        ...fila,
        hora: fecha.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }),
      })
    }
    return [...grupos.entries()]
  }, [filas, tipo, periodo, texto])
  const hayFiltros = Boolean(tipo || periodo || texto.trim())

  return (
    <ProfeLayout titulo="Historial de cambios" volverA="/profe/ajustes" soloAdmin>
      <p className="profe-nota">
        Todo lo que cambiás como Admin queda anotado acá solo, con fecha y hora. También quién
        archiva, recupera o borra ejercicios de la Biblioteca.
      </p>

      <input
        className="auth-input profe-buscador"
        type="search"
        placeholder="Buscar un nombre, un plan, un código…"
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        aria-label="Buscar en los cambios"
      />

      <Chips
        opciones={PERIODOS_HISTORIAL}
        activo={periodo}
        onCambiar={setPeriodo}
        etiqueta="Período"
      />

      <select
        className="profe-calendario-select estadisticas-filtro"
        value={tipo}
        onChange={(event) => setTipo(event.target.value)}
        aria-label="Qué cambios ver"
      >
        <option value="">Todos los cambios</option>
        {Object.entries(TIPOS).map(([id, texto]) => (
          <option key={id} value={id}>
            {texto}
          </option>
        ))}
      </select>

      {cargando ? (
        <Esqueleto />
      ) : error ? (
        <p className="profe-vacio">
          No pudimos cargar el historial. Si todavía no instalaste la actualización de la base (SQL
          022), hacelo primero.
        </p>
      ) : porDia.length === 0 ? (
        <p className="profe-vacio">
          {hayFiltros
            ? 'No hay cambios que coincidan con los filtros.'
            : 'Todavía no hay cambios anotados.'}
        </p>
      ) : (
        porDia.map(([dia, cambios]) => (
          <section key={dia} className="bloque-pagina">
            <p className="profe-seccion-label">{textoFechaCorta(dia)}</p>
            <div className="lista-tarjetas">
              {cambios.map((cambio) => (
                <div key={cambio.id} className="historial-item">
                  <span className="historial-hora">{cambio.hora}</span>
                  <span className="historial-textos">
                    <small>{TIPOS[cambio.tipo] || cambio.tipo}</small>
                    <span>{cambio.detalle}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </ProfeLayout>
  )
}
