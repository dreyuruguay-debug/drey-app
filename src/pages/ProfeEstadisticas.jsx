import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import GraficoProgreso from '../components/GraficoProgreso.jsx'
import { supabase } from '../services/supabaseClient.js'
import { traerTodasLasFilas } from '../services/paginado.js'
import { cargarPlanesConPrecios } from '../services/planes.js'
import { obtenerUsuarioActual } from '../services/sesion.js'
import { formatearPrecio } from '../data/planes.js'
import { calcularEstadisticas, desdeParaPagos, desdeParaSesiones } from '../utils/estadisticas.js'
import { obtenerFechaHoyISO } from '../utils/dias.js'
import { esCliente, esProfe } from '../utils/roles.js'
import Esqueleto from '../components/Esqueleto.jsx'

// Estadísticas del negocio: clientes activos, nuevos, los que se fueron,
// ingresos del mes (Mercado Pago + pagos confirmados por el profe),
// ingresos de los últimos 6 meses y entrenamientos por semana.
//
// Cada profe ve las de sus clientes. El administrador y el dueño de un
// gimnasio pueden elegir ver todo o un profe en particular. La base de
// datos ya devuelve solo lo que cada uno puede ver; los cálculos están en
// utils/estadisticas.js.
export default function ProfeEstadisticas() {
  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(null)
  const [profeElegido, setProfeElegido] = useState('')
  const hoy = obtenerFechaHoyISO()

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    const [{ data: perfiles }, { data: pagos }, { data: sesiones }, planes] = await Promise.all([
      traerTodasLasFilas(() => supabase.from('perfiles').select('*').order('id')),
      traerTodasLasFilas(() =>
        supabase
          .from('pagos')
          .select('id, cliente_id, monto, estado, primer_mes, creado_en, aprobado_en')
          .eq('estado', 'aprobado')
          .gte('creado_en', desdeParaPagos(hoy))
          .order('id'),
      ),
      traerTodasLasFilas(() =>
        supabase
          .from('sesiones')
          .select('id, cliente_id, fecha')
          .gte('fecha', desdeParaSesiones(hoy))
          .order('id'),
      ),
      cargarPlanesConPrecios(),
    ])
    const usuario = await obtenerUsuarioActual()
    setDatos({
      yo: usuario?.id,
      clientes: (perfiles || []).filter(esCliente),
      profes: (perfiles || []).filter(esProfe),
      pagos: pagos || [],
      sesiones: sesiones || [],
      planes,
    })
    setCargando(false)
  }

  const numeros = useMemo(() => {
    if (!datos) return null
    const clientes = profeElegido
      ? datos.clientes.filter((cliente) => cliente.profe_id === profeElegido)
      : datos.clientes
    const ids = new Set(clientes.map((cliente) => cliente.id))
    return calcularEstadisticas({
      clientes,
      pagos: datos.pagos.filter((pago) => ids.has(pago.cliente_id)),
      sesiones: datos.sesiones.filter((sesion) => ids.has(sesion.cliente_id)),
      planes: datos.planes,
      hoy,
    })
  }, [datos, profeElegido])

  if (cargando || !numeros) {
    return (
      <ProfeLayout titulo="Estadísticas" volverA="/profe">
        <Esqueleto />
      </ProfeLayout>
    )
  }

  const variacion = numeros.ingresosMesPasado
    ? Math.round(((numeros.ingresosMes - numeros.ingresosMesPasado) / numeros.ingresosMesPasado) * 100)
    : null

  return (
    <ProfeLayout titulo="Estadísticas" volverA="/profe">
      {datos.profes.length > 1 && (
        <select
          className="profe-calendario-select estadisticas-filtro"
          value={profeElegido}
          onChange={(event) => setProfeElegido(event.target.value)}
          aria-label="Ver estadísticas de"
        >
          <option value="">Todos los profes</option>
          {datos.profes.map((profe) => (
            <option key={profe.id} value={profe.id}>
              {profe.id === datos.yo ? 'Mis clientes' : `${profe.nombre} ${profe.apellido || ''}`}
            </option>
          ))}
        </select>
      )}

      <section className="estadisticas-grilla">
        <Numero etiqueta="Clientes activos" valor={numeros.activos} />
        <Numero etiqueta="Nuevos este mes" valor={numeros.nuevos} />
        <Numero
          etiqueta="Se fueron este mes"
          valor={numeros.seFueron.length}
          detalle={numeros.seFueron.length ? `${numeros.abandono}% de abandono` : ''}
          alerta={numeros.seFueron.length > 0}
        />
        <Numero etiqueta="Esperando alta" valor={numeros.pendientes} />
      </section>

      <section className="estadisticas-grilla estadisticas-grilla-dos">
        <Numero
          etiqueta="Ingresos este mes"
          valor={formatearPrecio(numeros.ingresosMes)}
          detalle={
            variacion === null
              ? ''
              : `${variacion >= 0 ? '+' : ''}${variacion}% vs. el mes pasado`
          }
        />
        <Numero
          etiqueta="Por mes si todos renuevan"
          valor={formatearPrecio(numeros.ingresoMensualEsperado)}
        />
      </section>

      <GraficoProgreso titulo="Ingresos por mes ($U)" tipo="barras" puntos={numeros.ingresosPorMes} />
      <p className="profe-nota">
        Suma los pagos con Mercado Pago y los que confirmás en Pagos (desde el 25/09/2026).
      </p>

      <GraficoProgreso
        titulo="Entrenamientos por semana"
        tipo="barras"
        puntos={numeros.entrenamientosPorSemana}
      />
      <p className="profe-nota">
        Esta semana entrenaron {numeros.entrenaronEstaSemana} de {numeros.activos} clientes activos.
      </p>

      {numeros.porPlan.length > 0 && (
        <section className="bloque-pagina">
          <p className="profe-seccion-label">Clientes activos por plan</p>
          {numeros.porPlan.map((fila) => (
            <p key={fila.nombre} className="pago-fila">
              <span>{fila.nombre}</span>
              <strong>{fila.cantidad}</strong>
            </p>
          ))}
        </section>
      )}

      {numeros.seFueron.length > 0 && (
        <section className="bloque-pagina">
          <p className="profe-seccion-label">Se fueron este mes</p>
          {numeros.seFueron.map((cliente) => (
            <Link
              key={cliente.id}
              to={`/profe/clientes/${cliente.id}?tab=pagos`}
              className="pago-fila enlace-tabla"
            >
              <span>
                {cliente.nombre} {cliente.apellido}
              </span>
              <span>{cliente.baja_solicitada_en ? 'Pidió la baja' : 'No renovó'}</span>
            </Link>
          ))}
        </section>
      )}
    </ProfeLayout>
  )
}

function Numero({ etiqueta, valor, detalle, alerta }) {
  return (
    <div className={alerta ? 'dato-tarjeta estadistica estadistica-alerta' : 'dato-tarjeta estadistica'}>
      <span className="dato-etiqueta">{etiqueta}</span>
      <strong className="dato-valor">{valor}</strong>
      {detalle && <small>{detalle}</small>}
    </div>
  )
}
