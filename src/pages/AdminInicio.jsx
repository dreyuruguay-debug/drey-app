import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import InterruptorNotificaciones from '../components/InterruptorNotificaciones.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import Numero from '../components/Numero.jsx'
import { supabase } from '../services/supabaseClient.js'
import { traerTodasLasFilas } from '../services/paginado.js'
import { cargarPlanesConPrecios } from '../services/planes.js'
import { recordado, recordar } from '../services/memoriaSesion.js'
import { formatearPrecio } from '../data/planes.js'
import { calcularEstadisticas, desdeParaPagos } from '../utils/estadisticas.js'
import { obtenerFechaHoyISO, textoFechaLarga } from '../utils/dias.js'
import { SOLO_CLIENTES } from '../utils/roles.js'

// Lo último que se mostró queda en memoria: al volver a Inicio se ve al
// instante y se actualiza por detrás.
const MEMORIA_INICIO_ADMIN = 'inicio-admin'

// Inicio del Admin: el resumen del negocio de un vistazo (clientes,
// ingresos, lo que espera una respuesta) y accesos a todo lo que
// administra. Los números salen de utils/estadisticas.js, los mismos que
// en "Estadísticas".
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

  async function cerrarSesion() {
    await supabase.auth.signOut()
    navigate('/')
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
          <section className="estadisticas-grilla">
            <Numero etiqueta="Clientes activos" valor={resumen.activos} />
            <Numero
              etiqueta="Ingresos este mes"
              valor={formatearPrecio(resumen.ingresosMes)}
              detalle={textoVariacion(resumen.ingresosMes, resumen.ingresosMesPasado)}
            />
            <Numero etiqueta="Nuevos este mes" valor={resumen.nuevos} />
            <Numero
              etiqueta="Se fueron este mes"
              valor={resumen.seFueron}
              alerta={resumen.seFueron > 0}
            />
          </section>

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
              <Link to="/profe/ajustes" className="acceso acceso-principal">
                Planes y precios
              </Link>
              <Link to="/profe/equipo" className="acceso">
                Profes y gimnasios
              </Link>
              <Link to="/profe/solicitudes" className="acceso">
                Solicitudes de alumnos
              </Link>
              <Link to="/profe/codigos" className="acceso">
                Códigos de descuento
              </Link>
              <Link to="/profe/ejercicios" className="acceso">
                Biblioteca de ejercicios
              </Link>
              <Link to="/profe/calendario" className="acceso">
                La semana de todos
              </Link>
              <Link to="/profe/ajustes/historial" className="acceso">
                Historial de cambios
              </Link>
              <Link to="/profe/rutinas" className="acceso">
                + Nueva rutina
              </Link>
            </div>
          </section>

          <div className="lista-tarjetas">
            <InterruptorNotificaciones textoActivar="Te avisamos en este celular cuando se registra o paga un cliente que no tiene profe." />
          </div>

          <button type="button" className="boton-texto perfil-salir" onClick={cerrarSesion}>
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
  ] = await Promise.all([
    traerTodasLasFilas(() =>
      supabase
        .from('perfiles')
        .select(
          'id, nombre, apellido, estado, vencimiento, plan, profe_id, aviso_pago, baja_solicitada_en',
        )
        .match(SOLO_CLIENTES)
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
      to: '/profe/cuentas',
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
      to: '/profe/cuentas',
      boton: 'Ver',
    })
  }
  if (sinProfe > 0) {
    pendientes.push({
      texto:
        sinProfe === 1
          ? '1 cliente activo no tiene profe'
          : `${sinProfe} clientes activos no tienen profe`,
      detalle: 'Asignales uno desde su ficha o en Equipo → Clientes.',
      to: '/profe/equipo',
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

  return {
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
