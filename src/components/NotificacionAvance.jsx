import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient.js'
import { marcarResumenVisto } from '../services/progreso.js'
import ResumenProgreso from './ResumenProgreso.jsx'

// "Notificación de avance" (dentro de Mis datos): los resúmenes de 4
// semanas que el profe ya aprobó y publicó. La base de datos solo le
// devuelve al cliente los suyos publicados. Al abrir uno nuevo se marca
// como visto y deja de aparecer el aviso en Inicio.
export default function NotificacionAvance({ clienteId }) {
  const [resumenes, setResumenes] = useState([])
  const [abierto, setAbierto] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (clienteId) cargar()
  }, [clienteId])

  async function cargar() {
    setCargando(true)
    const { data } = await supabase
      .from('resumenes_progreso')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('estado', 'publicado')
      .order('ciclo', { ascending: false })
    const lista = data || []
    setResumenes(lista)
    // El más reciente se muestra abierto si todavía no lo vio.
    const nuevo = lista.find((resumen) => !resumen.visto)
    if (nuevo) abrir(nuevo)
    setCargando(false)
    // Si llegó desde el aviso de Inicio (/mis-datos#avance), baja hasta acá.
    if (window.location.hash === '#avance') {
      setTimeout(
        () => document.getElementById('avance')?.scrollIntoView({ behavior: 'smooth' }),
        100,
      )
    }
  }

  function abrir(resumen) {
    setAbierto((actual) => (actual === resumen.id ? null : resumen.id))
    if (!resumen.visto) {
      marcarResumenVisto(resumen.id)
      setResumenes((actual) =>
        actual.map((item) => (item.id === resumen.id ? { ...item, visto: true } : item)),
      )
    }
  }

  return (
    <section id="avance" className="avance-seccion">
      <p className="form-section-label">Notificación de avance</p>
      {cargando ? (
        <p className="registro-edad">Cargando…</p>
      ) : resumenes.length === 0 ? (
        <p className="registro-edad">
          Cada 4 semanas tu profe revisa tu progreso y te lo publica acá.
        </p>
      ) : (
        resumenes.map((resumen) => (
          <div key={resumen.id} className="avance-item">
            <button type="button" className="avance-cabecera" onClick={() => abrir(resumen)}>
              <span>Ciclo {resumen.ciclo}</span>
              {!resumen.visto && <span className="avance-nuevo">Nuevo</span>}
              <span className="avance-flecha">{abierto === resumen.id ? '▲' : '▼'}</span>
            </button>
            {abierto === resumen.id && <ResumenProgreso resumen={resumen} />}
          </div>
        ))
      )}
    </section>
  )
}
