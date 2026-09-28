import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../services/supabaseClient.js'
import Esqueleto from './Esqueleto.jsx'
import { SOLO_CLIENTES } from '../utils/roles.js'

// Ventana para copiar una rutina de otro cliente: se busca, se elige y
// se crea una copia en borrador para este cliente (ver duplicarRutina).
export default function CopiarRutina({ clienteId, onElegir, onCerrar }) {
  const [cargando, setCargando] = useState(true)
  const [rutinas, setRutinas] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [copiando, setCopiando] = useState(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const [{ data: lista }, { data: clientes }] = await Promise.all([
      supabase.from('rutinas').select('*').neq('cliente_id', clienteId).eq('publicada', true),
      supabase.from('perfiles').select('id, nombre, apellido').match(SOLO_CLIENTES),
    ])
    const nombres = Object.fromEntries(
      (clientes || []).map((cliente) => [cliente.id, `${cliente.nombre} ${cliente.apellido}`]),
    )
    setRutinas(
      (lista || [])
        .map((rutina) => ({ ...rutina, deCliente: nombres[rutina.cliente_id] || 'Otro cliente' }))
        .sort((a, b) => a.deCliente.localeCompare(b.deCliente)),
    )
    setCargando(false)
  }

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return rutinas
    return rutinas.filter((rutina) =>
      `${rutina.nombre} ${rutina.deCliente}`.toLowerCase().includes(texto),
    )
  }, [rutinas, busqueda])

  async function elegir(rutina) {
    setCopiando(rutina.id)
    await onElegir(rutina)
    setCopiando(null)
  }

  return (
    <div className="asistente-fondo" role="presentation">
      <div
        className="asistente-hoja"
        role="dialog"
        aria-modal="true"
        aria-label="Copiar una rutina"
      >
        <div className="asistente-cabecera">
          <p className="asistente-titulo">Copiar una rutina</p>
          <button type="button" className="asistente-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <p className="profe-nota">
          Se crea una copia en borrador para este cliente. La original no cambia.
        </p>
        <input
          className="auth-input"
          type="search"
          placeholder="Buscar por rutina o cliente…"
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
        />
        {cargando ? (
          <Esqueleto filas={2} />
        ) : visibles.length === 0 ? (
          <p className="profe-vacio">No hay rutinas de otros clientes para copiar.</p>
        ) : (
          <div className="lista-tarjetas">
            {visibles.map((rutina) => (
              <button
                key={rutina.id}
                type="button"
                className="tarjeta-rutina"
                onClick={() => elegir(rutina)}
                disabled={Boolean(copiando)}
              >
                <span className="tarjeta-rutina-textos">
                  <strong>{rutina.nombre}</strong>
                  <small>
                    De {rutina.deCliente}
                    {rutina.musculos ? ` · ${rutina.musculos}` : ''}
                  </small>
                </span>
                <span className="tarjeta-flecha">{copiando === rutina.id ? '…' : 'Copiar'}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
