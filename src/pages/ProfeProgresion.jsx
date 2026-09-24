import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { generarResumenesPendientes } from '../services/progreso.js'

// Progresión: los resúmenes de 4 semanas que esperan revisión del profe
// y el acceso a las gráficas de cada cliente. Al abrir esta pantalla se
// generan solos los resúmenes de los ciclos que ya terminaron.
export default function ProfeProgresion() {
  const [cargando, setCargando] = useState(true)
  const [borradores, setBorradores] = useState([])
  const [clientes, setClientes] = useState([])

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    await generarResumenesPendientes()
    const [{ data: listaBorradores }, { data: listaClientes }] = await Promise.all([
      supabase
        .from('resumenes_progreso')
        .select('id, cliente_id, ciclo, desde, hasta, datos')
        .eq('estado', 'borrador')
        .order('hasta'),
      supabase
        .from('perfiles')
        .select('id, nombre, apellido')
        .eq('estado', 'activo')
        .eq('es_profe', false)
        .order('nombre'),
    ])
    setBorradores(listaBorradores || [])
    setClientes(listaClientes || [])
    setCargando(false)
  }

  const nombrePorId = Object.fromEntries(
    clientes.map((cliente) => [cliente.id, `${cliente.nombre} ${cliente.apellido}`]),
  )

  return (
    <ProfeLayout titulo="Progresión">
      <p className="profe-nota">
        Cada 4 semanas de entrenamiento la app arma sola un resumen de cada cliente. Revisalo,
        sumale un comentario si querés y publicalo: el cliente lo ve en "Mis datos".
      </p>

      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : (
        <>
          <p className="profe-seccion-label">
            Resúmenes para revisar {borradores.length > 0 && `(${borradores.length})`}
          </p>
          {borradores.length === 0 ? (
            <p className="profe-vacio">No hay resúmenes esperando revisión.</p>
          ) : (
            borradores.map((resumen) => (
              <Link
                key={resumen.id}
                to={`/profe/clientes/${resumen.cliente_id}/progreso`}
                className="profe-cliente-card profe-cliente-card-link"
              >
                <div>
                  <p className="profe-cliente-nombre">
                    {nombrePorId[resumen.cliente_id] || 'Cliente'}
                  </p>
                  <p className="profe-cliente-detalle">
                    Ciclo {resumen.ciclo} · {resumen.datos?.entrenamientos ?? 0} entrenamientos ·{' '}
                    {resumen.datos?.ejerciciosQueSubieron ?? 0} ejercicios con más carga
                  </p>
                </div>
                <span className="profe-cliente-flecha">→</span>
              </Link>
            ))
          )}

          <p className="profe-seccion-label">Gráficas por cliente</p>
          {clientes.length === 0 ? (
            <p className="profe-vacio">Todavía no tenés clientes activos.</p>
          ) : (
            clientes.map((cliente) => (
              <Link
                key={cliente.id}
                to={`/profe/clientes/${cliente.id}/progreso`}
                className="profe-cliente-card profe-cliente-card-link"
              >
                <p className="profe-cliente-nombre">
                  {cliente.nombre} {cliente.apellido}
                </p>
                <span className="profe-cliente-flecha">→</span>
              </Link>
            ))
          )}
        </>
      )}
    </ProfeLayout>
  )
}
