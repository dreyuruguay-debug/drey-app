import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient.js'
import { marcarResumenVisto } from '../services/progreso.js'
import { guardarCopia, leerCopia } from '../services/copiaLocal.js'
import ResumenProgreso from './ResumenProgreso.jsx'
import Esqueleto from './Esqueleto.jsx'

const COPIA = 'resumenes'

// Resúmenes de avance (en "Progreso"): los resúmenes de 4
// semanas que el profe ya aprobó y publicó. La base de datos solo le
// devuelve al cliente los suyos publicados. Al abrir uno nuevo se marca
// como visto y deja de aparecer el aviso en Inicio. Se muestran al
// instante los guardados en el celular (COPIA) y se actualizan por detrás.
export default function NotificacionAvance({ clienteId }) {
  // Lo último guardado en el celular se ve al instante.
  const [resumenes, setResumenes] = useState(() => leerCopia(clienteId, COPIA) || [])
  const [abierto, setAbierto] = useState(null)
  const [cargando, setCargando] = useState(() => !leerCopia(clienteId, COPIA))

  useEffect(() => {
    if (clienteId) cargar()
  }, [clienteId])

  async function cargar() {
    const { data, error } = await supabase
      .from('resumenes_progreso')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('estado', 'publicado')
      .order('ciclo', { ascending: false })
    if (error) {
      // Sin señal: queda lo guardado.
      setCargando(false)
      return
    }
    const lista = data || []
    guardarCopia(clienteId, COPIA, lista)
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
      <p className="seccion-etiqueta">Resúmenes de tu profe (cada 4 semanas)</p>
      {cargando ? (
        <Esqueleto tipo="linea" />
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
