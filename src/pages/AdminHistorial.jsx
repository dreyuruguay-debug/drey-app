import { useEffect, useMemo, useState } from 'react'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { cargarHistorial } from '../services/configuracion.js'
import { fechaLocalISO, textoFechaCorta } from '../utils/dias.js'

// Historial de cambios del Admin (tabla "historial_admin",
// supabase/sql/022). La base anota sola cada cambio que hace el Admin:
// precios y planes, ajustes, profes, gimnasios, clientes reasignados y
// pagos confirmados. También quién archiva, recupera o borra ejercicios
// de la Biblioteca, sea profe o Admin (supabase/sql/024), y los cambios
// de la página de inicio (supabase/sql/027). Acá se ven los
// últimos 200, agrupados por día.
const TIPOS = {
  plan: 'Planes',
  ajustes: 'Ajustes',
  profe: 'Profes',
  cliente: 'Clientes',
  gimnasio: 'Gimnasios',
  pago: 'Pagos',
  biblioteca: 'Biblioteca',
  pagina: 'Página de inicio',
}

export default function AdminHistorial() {
  const [cargando, setCargando] = useState(true)
  const [filas, setFilas] = useState([])
  const [error, setError] = useState(false)
  const [tipo, setTipo] = useState('')

  useEffect(() => {
    cargarHistorial(200).then((resultado) => {
      setFilas(resultado.filas)
      setError(Boolean(resultado.error))
      setCargando(false)
    })
  }, [])

  const porDia = useMemo(() => {
    const grupos = new Map()
    for (const fila of filas) {
      if (tipo && fila.tipo !== tipo) continue
      const fecha = new Date(fila.creado_en)
      const dia = fechaLocalISO(fecha)
      if (!grupos.has(dia)) grupos.set(dia, [])
      grupos.get(dia).push({
        ...fila,
        hora: fecha.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' }),
      })
    }
    return [...grupos.entries()]
  }, [filas, tipo])

  return (
    <ProfeLayout titulo="Historial de cambios" volverA="/profe/ajustes" soloAdmin>
      <p className="profe-nota">
        Todo lo que cambiás como Admin queda anotado acá solo, con fecha y hora. También quién
        archiva, recupera o borra ejercicios de la Biblioteca.
      </p>

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
        <p className="profe-vacio">Todavía no hay cambios anotados.</p>
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
