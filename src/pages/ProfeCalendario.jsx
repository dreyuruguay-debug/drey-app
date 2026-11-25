import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Pestanas from '../components/Pestanas.jsx'
import { supabase } from '../services/supabaseClient.js'
import { clientesDelEspacio } from '../services/espacio.js'
import {
  DIAS_SEMANA,
  obtenerFechaHoyISO,
  obtenerLunesDeSemana,
  sumarDias,
  textoFechaCorta,
} from '../utils/dias.js'
import { armarSemana } from '../utils/semanaDeTodos.js'
import Esqueleto from '../components/Esqueleto.jsx'

// "La semana de todos": todos los clientes en una sola tabla, con dos vistas.
//
//   · Cómo viene: qué hizo cada uno cada día (✓ entrenó, ✕ le tocaba y no
//     vino, el nombre de la rutina si le toca más adelante). Se puede ir a
//     semanas anteriores con ‹ ›. Para las semanas pasadas, "le tocaba"
//     es según el calendario de hoy.
//   · Qué le toca: qué rutina le toca a cada uno cada día. Cada celda se
//     puede cambiar acá mismo (se guarda en "calendario_cliente", igual
//     que en la ficha del cliente).
export default function ProfeCalendario() {
  const hoy = obtenerFechaHoyISO()
  const [vista, setVista] = useState('como-viene')
  const [cargando, setCargando] = useState(true)
  const [clientes, setClientes] = useState([])
  const [rutinasPorCliente, setRutinasPorCliente] = useState({})
  const [calendario, setCalendario] = useState({})
  const [lunes, setLunes] = useState(() => obtenerLunesDeSemana(hoy))
  const [sesiones, setSesiones] = useState([])

  useEffect(() => {
    cargarTodo()
  }, [])

  // Lo que entrenaron en la semana elegida.
  useEffect(() => {
    const ids = clientes.map((cliente) => cliente.id)
    if (!ids.length) {
      setSesiones([])
      return undefined
    }
    let vigente = true
    supabase
      .from('sesiones')
      .select('cliente_id, fecha, rutina_id')
      .in('cliente_id', ids)
      .gte('fecha', lunes)
      .lte('fecha', sumarDias(lunes, 6))
      .then(({ data }) => vigente && setSesiones(data || []))
    return () => {
      vigente = false
    }
  }, [clientes, lunes])

  async function cargarTodo() {
    setCargando(true)
    const { data: listaClientes } = await clientesDelEspacio('id, nombre, apellido')
      .eq('estado', 'activo')
      .order('nombre')

    const clientesData = listaClientes || []
    const ids = clientesData.map((cliente) => cliente.id)

    if (ids.length === 0) {
      setClientes([])
      setRutinasPorCliente({})
      setCalendario({})
      setCargando(false)
      return
    }

    const [{ data: rutinas }, { data: calendarioData }] = await Promise.all([
      // Solo las rutinas ya guardadas: las que están en borrador el
      // cliente todavía no las ve, así que no se pueden asignar.
      supabase
        .from('rutinas')
        .select('id, cliente_id, nombre')
        .in('cliente_id', ids)
        .eq('publicada', true)
        .order('orden'),
      supabase
        .from('calendario_cliente')
        .select('cliente_id, dia, rutina_id')
        .in('cliente_id', ids),
    ])

    const rutinasAgrupadas = {}
    for (const rutina of rutinas || []) {
      if (!rutinasAgrupadas[rutina.cliente_id]) rutinasAgrupadas[rutina.cliente_id] = []
      rutinasAgrupadas[rutina.cliente_id].push(rutina)
    }

    const calendarioAgrupado = {}
    for (const fila of calendarioData || []) {
      if (!calendarioAgrupado[fila.cliente_id]) calendarioAgrupado[fila.cliente_id] = {}
      calendarioAgrupado[fila.cliente_id][fila.dia] = fila.rutina_id
    }
    setRutinasPorCliente(rutinasAgrupadas)
    setCalendario(calendarioAgrupado)
    setClientes(clientesData)
    setCargando(false)
  }

  async function actualizarDia(clienteId, dia, rutinaId) {
    setCalendario((actual) => ({
      ...actual,
      [clienteId]: { ...actual[clienteId], [dia]: rutinaId || null },
    }))
    await supabase
      .from('calendario_cliente')
      .upsert(
        { cliente_id: clienteId, dia, rutina_id: rutinaId || null },
        { onConflict: 'cliente_id,dia' },
      )
  }

  const nombresDeRutinas = useMemo(
    () =>
      Object.fromEntries(
        Object.values(rutinasPorCliente)
          .flat()
          .map((rutina) => [rutina.id, rutina.nombre]),
      ),
    [rutinasPorCliente],
  )
  const semana = useMemo(
    () =>
      armarSemana({
        clientes,
        calendario,
        rutinas: nombresDeRutinas,
        sesiones,
        lunes,
        hoy,
      }),
    [clientes, calendario, nombresDeRutinas, sesiones, lunes, hoy],
  )
  const esEstaSemana = lunes === obtenerLunesDeSemana(hoy)

  return (
    <ProfeLayout titulo="La semana de todos" volverA="/profe/clientes">
      <Pestanas
        etiqueta="Qué ver"
        activa={vista}
        onCambiar={setVista}
        opciones={[
          { id: 'como-viene', label: 'Cómo viene' },
          { id: 'que-le-toca', label: 'Qué le toca' },
        ]}
      />

      {cargando ? (
        <Esqueleto />
      ) : clientes.length === 0 ? (
        <p className="profe-vacio">Todavía no tenés clientes activos.</p>
      ) : vista === 'como-viene' ? (
        <>
          <div className="semana-cabecera">
            <button
              type="button"
              className="boton-secundario boton-chico"
              onClick={() => setLunes(sumarDias(lunes, -7))}
              aria-label="Semana anterior"
            >
              ‹
            </button>
            <strong>
              {esEstaSemana
                ? 'Esta semana'
                : `Semana del ${textoFechaCorta(lunes)} al ${textoFechaCorta(sumarDias(lunes, 6))}`}
            </strong>
            <button
              type="button"
              className="boton-secundario boton-chico"
              onClick={() => setLunes(sumarDias(lunes, 7))}
              disabled={esEstaSemana}
              aria-label="Semana siguiente"
            >
              ›
            </button>
          </div>
          <p className="profe-nota">
            {semana.totales.hechos} de {semana.totales.previstos} entrenamientos hechos
            {semana.totales.faltas > 0 &&
              ` · ${semana.totales.faltas} ${semana.totales.faltas === 1 ? 'falta' : 'faltas'}`}
            {semana.totales.sinEntrenar > 0 &&
              ` · ${semana.totales.sinEntrenar} ${
                semana.totales.sinEntrenar === 1 ? 'alumno no entrenó' : 'alumnos no entrenaron'
              } todavía`}
          </p>
          <div className="profe-tabla-wrap">
            <table className="profe-tabla profe-tabla-calendario semana-tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  {DIAS_SEMANA.map((dia, indice) => (
                    <th key={dia} className={sumarDias(lunes, indice) === hoy ? 'semana-hoy' : ''}>
                      {dia.slice(0, 3)}
                    </th>
                  ))}
                  <th>Hizo</th>
                </tr>
              </thead>
              <tbody>
                {semana.filas.map(({ cliente, celdas, hechos, previstos }) => (
                  <tr key={cliente.id}>
                    <td>
                      <Link
                        to={`/profe/clientes/${cliente.id}`}
                        className="profe-tabla-cliente-link"
                      >
                        {cliente.nombre} {cliente.apellido}
                      </Link>
                    </td>
                    {celdas.map((celda) => (
                      <td key={celda.dia} className={celda.fecha === hoy ? 'semana-hoy' : ''}>
                        <CeldaSemana celda={celda} />
                      </td>
                    ))}
                    <td>
                      <span
                        className={
                          previstos > 0 && hechos >= previstos
                            ? 'semana-total semana-total-ok'
                            : 'semana-total'
                        }
                      >
                        {hechos} de {previstos}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <p className="profe-nota">
            Qué rutina le toca a cada cliente cada día. Tocá cualquier celda para cambiarla sin
            tener que entrar a ese cliente.
          </p>
          <div className="profe-tabla-wrap">
            <table className="profe-tabla profe-tabla-calendario">
              <thead>
                <tr>
                  <th>Cliente</th>
                  {DIAS_SEMANA.map((dia) => (
                    <th key={dia}>{dia.slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientes.map((cliente) => {
                  const rutinasCliente = rutinasPorCliente[cliente.id] || []
                  const calendarioCliente = calendario[cliente.id] || {}
                  return (
                    <tr key={cliente.id}>
                      <td>
                        <Link
                          to={`/profe/clientes/${cliente.id}`}
                          className="profe-tabla-cliente-link"
                        >
                          {cliente.nombre} {cliente.apellido}
                        </Link>
                      </td>
                      {DIAS_SEMANA.map((dia) => (
                        <td key={dia}>
                          {rutinasCliente.length === 0 ? (
                            <span className="profe-tabla-sin-rutinas">—</span>
                          ) : (
                            <select
                              className="profe-calendario-select"
                              value={calendarioCliente[dia] || ''}
                              onChange={(event) =>
                                actualizarDia(cliente.id, dia, event.target.value || null)
                              }
                            >
                              <option value="">Descanso</option>
                              {rutinasCliente.map((rutina) => (
                                <option key={rutina.id} value={rutina.id}>
                                  {rutina.nombre}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ProfeLayout>
  )
}

// Una celda de "Cómo viene": ✓ entrenó · ✕ faltó · rutina que le toca · descanso.
function CeldaSemana({ celda }) {
  if (celda.estado === 'descanso') return <span className="semana-celda semana-descanso">·</span>
  const icono = celda.estado === 'hecho' ? '✓' : celda.estado === 'falto' ? '✕' : ''
  const ayuda =
    celda.estado === 'hecho'
      ? `Entrenó: ${celda.texto}`
      : celda.estado === 'falto'
        ? `Le tocaba ${celda.texto} y no entrenó`
        : `Le toca ${celda.texto}`
  return (
    <span className={`semana-celda semana-${celda.estado}`} title={ayuda} aria-label={ayuda}>
      {icono && <b aria-hidden="true">{icono}</b>}
      <span>{celda.texto}</span>
    </span>
  )
}
