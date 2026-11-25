import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import InterruptorNotificaciones from '../components/InterruptorNotificaciones.jsx'
import SelectorTema from '../components/SelectorTema.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import Numero from '../components/Numero.jsx'
import { supabase } from '../services/supabaseClient.js'
import { cerrarSesion } from '../services/cerrarSesion.js'
import { traerTodasLasFilas } from '../services/paginado.js'
import { cargarPlanesConPrecios } from '../services/planes.js'
import { recordado, recordar } from '../services/memoriaSesion.js'
import { formatearPrecio } from '../data/planes.js'
import { calcularEstadisticas, desdeParaPagos } from '../utils/estadisticas.js'
import { cargarEspaciosAdmin, cargarPagosDrey } from '../services/suscripcionDrey.js'
import { resumenDrey } from '../utils/resumenDrey.js'
import { obtenerFechaHoyISO, textoFechaLarga } from '../utils/dias.js'
import { SOLO_CLIENTES } from '../utils/roles.js'
import { RUTA_INGRESAR } from '../data/rutas.js'

// Lo último que se mostró queda en memoria: al volver a Inicio se ve al
// instante y se actualiza por detrás.
const MEMORIA_INICIO_ADMIN = 'inicio-admin'

// Inicio del Admin: el negocio de DREY de un vistazo. Arriba, lo que
// entra a DREY por los profes y gimnasios (utils/resumenDrey.js): ingreso
// del mes, espacios que pagan, pruebas gratis (y cuántas terminan esta
// semana) y suscripciones por vencer. Después, lo que espera una
// respuesta, y más abajo y más chico, los números de los alumnos de todos
// los espacios (utils/estadisticas.js, los mismos que en "Estadísticas").
// Accesos rápidos: solo 4 (Estadísticas, Planes y precios, Biblioteca e
// Historial); lo demás está en el menú (Espacios, Alumnos, Cobros).
export default function AdminInicio() {
  const navigate = useNavigate()
  const guardado = recordado(MEMORIA_INICIO_ADMIN)
  const [resumen, setResumen] = useState(guardado || null)

  useEffect(() => {
    let activo = true
    cargar().then((nuevo) => {
      if (!activo) return
      recordar(MEMORIA_INICIO_ADMIN, nuevo)
      setResumen(nuevo)
    })
    return () => {
      activo = false
    }
  }, [])

  async function salir() {
    await cerrarSesion()
    navigate(RUTA_INGRESAR)
  }

  return (
    <ProfeLayout>
      <header className="inicio-saludo inicio-saludo-profe">
        <div>
          <p className="inicio-fecha">{textoFechaLarga()}</p>
          <span className="estado-chip estado-ok etiqueta-admin">Admin</span>
          <h1 className="inicio-hola">Tu negocio hoy</h1>
        </div>
      </header>

      {!resumen ? (
        <Esqueleto />
      ) : (
        <>
          {resumen.drey && (
            <section className="drey-resumen">
              <p className="seccion-etiqueta">DREY este mes · profes y gimnasios</p>
              <div className="estadisticas-grilla">
                <Numero
                  etiqueta="Ingresos de DREY"
                  valor={formatearPrecio(resumen.drey.ingresosMes)}
                  detalle={textoVariacion(resumen.drey.ingresosMes, resumen.drey.ingresosMesPasado)}
                />
                <Numero
                  etiqueta="Espacios que pagan"
                  valor={resumen.drey.pagan}
                  detalle={`${resumen.drey.cuposVendidos} cupos · ${resumen.drey.cuposOcupados} ocupados`}
                />
                <Numero
                  etiqueta="En prueba gratis"
                  valor={resumen.drey.enPrueba}
                  detalle={
                    resumen.drey.pruebasPorTerminar > 0
                      ? `${resumen.drey.pruebasPorTerminar} ${resumen.drey.pruebasPorTerminar === 1 ? 'termina' : 'terminan'} esta semana`
                      : `${resumen.drey.sinCosto} sin costo`
                  }
                  alerta={resumen.drey.pruebasPorTerminar > 0}
                />
                <Numero
                  etiqueta="Por vencer o vencidos"
                  valor={resumen.drey.porVencer}
                  alerta={resumen.drey.porVencer > 0}
                />
              </div>
            </section>
          )}

          <section className="tareas">
            <p className="seccion-etiqueta">Para atender</p>
            {resumen.pendientes.length === 0 ? (
              <div className="tarea tarea-ok">
                <span className="tarea-icono tarea-icono-ok" aria-hidden="true">
                  ✓
                </span>
                <span className="tarea-textos">
                  <strong>¡Todo al día!</strong>
                  <small>No hay cuentas ni pagos esperando, y todos tienen profe.</small>
                </span>
              </div>
            ) : (
              resumen.pendientes.map((item) => (
                <div key={item.texto} className="tarea tarea-urgente">
                  <span className="tarea-textos">
                    <strong>{item.texto}</strong>
                    {item.detalle && <small>{item.detalle}</small>}
                  </span>
                  <Link to={item.to} className="boton-principal boton-chico">
                    {item.boton}
                  </Link>
                </div>
              ))
            )}
          </section>

          <section className="admin-alumnos-resumen">
            <p className="seccion-etiqueta">Alumnos de todos los espacios</p>
            <div className="estadisticas-grilla estadisticas-grilla-chica">
              <Numero etiqueta="Activos" valor={resumen.activos} />
              <Numero etiqueta="Nuevos este mes" valor={resumen.nuevos} />
              <Numero
                etiqueta="Se fueron este mes"
                valor={resumen.seFueron}
                alerta={resumen.seFueron > 0}
              />
              <Numero
                etiqueta="Cobrado por los espacios"
                valor={formatearPrecio(resumen.ingresosMes)}
                detalle="Lo que pagaron los alumnos este mes"
              />
            </div>
          </section>

          <section className="estadisticas-grilla estadisticas-grilla-dos">
            <Numero etiqueta="Profes" valor={resumen.profes} />
            <Numero etiqueta="Gimnasios" valor={resumen.gimnasios} />
          </section>

          <section className="accesos">
            <p className="seccion-etiqueta">Accesos rápidos</p>
            <div className="accesos-grilla">
              <Link to="/profe/estadisticas" className="acceso acceso-principal">
                Estadísticas
              </Link>
              <Link to="/profe/ajustes" className="acceso">
                Planes y precios
              </Link>
              <Link to="/profe/ejercicios" className="acceso">
                Biblioteca de ejercicios
              </Link>
              <Link to="/profe/ajustes/historial" className="acceso">
                Historial de cambios
              </Link>
            </div>
          </section>

          <div className="lista-tarjetas">
            <InterruptorNotificaciones textoActivar="Te avisamos en este celular cuando se registra o paga un cliente que no tiene profe." />
          </div>

          <SelectorTema />

          <button type="button" className="boton-texto perfil-salir" onClick={salir}>
            Cerrar sesión
          </button>
        </>
      )}
    </ProfeLayout>
  )
}

// Trae todo en un solo viaje y arma el resumen.
async function cargar() {
  const hoy = obtenerFechaHoyISO()
  const [
    { data: clientes },
    { data: pagos },
    { count: profes },
    { count: gimnasios },
    planes,
    { count: solicitudes },
    { espacios, error: errorEspacios },
    { pagos: pagosDrey },
  ] = await Promise.all([
    traerTodasLasFilas(() =>
      supabase
        .from('perfiles')
        .select(
          'id, nombre, apellido, estado, vencimiento, plan, profe_id, aviso_pago, baja_solicitada_en',
        )
        .match(SOLO_CLIENTES)
        // Los dados de baja no cuentan (supabase/sql/037).
        .neq('estado', 'baja')
        .order('id'),
    ),
    traerTodasLasFilas(() =>
      supabase
        .from('pagos')
        .select('id, cliente_id, monto, estado, primer_mes, creado_en, aprobado_en')
        .eq('estado', 'aprobado')
        .gte('creado_en', desdeParaPagos(hoy))
        .order('id'),
    ),
    supabase.from('perfiles').select('id', { count: 'exact', head: true }).eq('es_profe', true),
    supabase.from('gimnasios').select('id', { count: 'exact', head: true }),
    cargarPlanesConPrecios({ incluirOcultos: true }),
    // Alumnos que pidieron un profe y esperan respuesta (026).
    supabase
      .from('solicitudes_profe')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente'),
    // Cobro por cupos (SQL 032): sin esa actualización, no se muestra.
    cargarEspaciosAdmin(),
    cargarPagosDrey(null, 500),
  ])

  const lista = clientes || []
  const numeros = calcularEstadisticas({ clientes: lista, pagos: pagos || [], planes, hoy })

  const esperanAlta = lista.filter((cliente) => cliente.estado === 'pendiente').length
  const avisaronPago = lista.filter(
    (cliente) => cliente.estado !== 'pendiente' && cliente.aviso_pago,
  ).length
  const sinProfe = lista.filter(
    (cliente) => !cliente.profe_id && cliente.estado === 'activo',
  ).length

  const pendientes = []
  if (esperanAlta > 0) {
    pendientes.push({
      texto:
        esperanAlta === 1
          ? '1 cuenta espera que la habilites'
          : `${esperanAlta} cuentas esperan que las habilites`,
      to: '/profe/cuentas?tab=alumnos',
      boton: 'Ver',
    })
  }
  if (avisaronPago > 0) {
    pendientes.push({
      texto:
        avisaronPago === 1
          ? '1 cliente avisó que pagó'
          : `${avisaronPago} clientes avisaron que pagaron`,
      detalle: 'Revisá el comprobante y confirmalo.',
      to: '/profe/cuentas?tab=alumnos',
      boton: 'Ver',
    })
  }
  if (sinProfe > 0) {
    pendientes.push({
      texto:
        sinProfe === 1
          ? '1 alumno activo no tiene profe'
          : `${sinProfe} alumnos activos no tienen profe`,
      detalle: 'Elegilos en Alumnos y tocá "Asignar a un profe".',
      to: '/profe/clientes?profe=sin',
      boton: 'Asignar',
    })
  }
  if (solicitudes > 0) {
    pendientes.push({
      texto:
        solicitudes === 1
          ? '1 alumno espera que un profe responda su solicitud'
          : `${solicitudes} alumnos esperan que un profe responda su solicitud`,
      detalle: 'Cada profe las responde desde su panel; vos también podés.',
      to: '/profe/solicitudes',
      boton: 'Ver',
    })
  }

  const drey = errorEspacios ? null : resumenDrey(espacios, pagosDrey, hoy)
  if (drey?.avisaronPago > 0) {
    pendientes.unshift({
      texto:
        drey.avisaronPago === 1
          ? '1 profe o gimnasio avisó que le pagó a DREY'
          : `${drey.avisaronPago} profes o gimnasios avisaron que le pagaron a DREY`,
      detalle: 'Revisá el comprobante y confirmalo.',
      to: '/profe/cuentas?tab=drey',
      boton: 'Ver',
    })
  }
  if (drey?.pruebasPorTerminar > 0 || drey?.terminaronPrueba > 0) {
    const partes = []
    if (drey.pruebasPorTerminar > 0) {
      partes.push(
        drey.pruebasPorTerminar === 1
          ? '1 prueba gratis termina esta semana'
          : `${drey.pruebasPorTerminar} pruebas gratis terminan esta semana`,
      )
    }
    if (drey.terminaronPrueba > 0) {
      partes.push(
        drey.terminaronPrueba === 1
          ? '1 espacio terminó la prueba sin elegir plan'
          : `${drey.terminaronPrueba} espacios terminaron la prueba sin elegir plan`,
      )
    }
    pendientes.push({
      texto: partes.join(' · '),
      detalle: 'Buen momento para escribirles y contarles los planes.',
      to: '/profe/equipo',
      boton: 'Ver',
    })
  }
  if (drey?.porVencer > 0) {
    pendientes.push({
      texto:
        drey.porVencer === 1
          ? '1 suscripción DREY vence pronto o venció'
          : `${drey.porVencer} suscripciones DREY vencen pronto o vencieron`,
      to: '/profe/cuentas?tab=drey',
      boton: 'Ver',
    })
  }

  return {
    drey,
    activos: numeros.activos,
    nuevos: numeros.nuevos,
    seFueron: numeros.seFueron.length,
    ingresosMes: numeros.ingresosMes,
    ingresosMesPasado: numeros.ingresosMesPasado,
    profes: profes || 0,
    gimnasios: gimnasios || 0,
    pendientes,
  }
}

function textoVariacion(actual, anterior) {
  if (!anterior) return ''
  const variacion = Math.round(((actual - anterior) / anterior) * 100)
  return `${variacion >= 0 ? '+' : ''}${variacion}% vs. el mes pasado`
}
