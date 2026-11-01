import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BarraCupos from './BarraCupos.jsx'
import { cargarResumenEspacio } from '../services/suscripcionDrey.js'
import { recordado, recordar } from '../services/memoriaSesion.js'
import { estadoDeEspacio } from '../data/vencimiento.js'
import { obtenerFechaHoyISO } from '../utils/dias.js'

// "Tu gimnasio de un vistazo" en el Inicio del dueño (supabase/sql/035):
// la suscripción DREY, la barra de cupos y los números de sus alumnos.
// Cada número lleva a la pantalla donde se resuelve. Lo ve solo el dueño
// del espacio elegido (en su espacio personal, el profe).
export default function ResumenEspacio({ espacio }) {
  const clave = `resumen-espacio-${espacio.id}`
  const [resumen, setResumen] = useState(() => recordado(clave))

  useEffect(() => {
    let vigente = true
    cargarResumenEspacio(espacio.id).then(({ resumen: datos }) => {
      if (!vigente || !datos) return
      recordar(clave, datos)
      setResumen(datos)
    })
    return () => {
      vigente = false
    }
  }, [clave, espacio.id])

  const estado = estadoDeEspacio(espacio, obtenerFechaHoyISO())
  const gimnasio = espacio.tipo === 'gimnasio'

  const numeros = resumen
    ? [
        { valor: resumen.activos, texto: 'activos', to: '/profe/clientes' },
        {
          valor: resumen.pendientes,
          texto: 'esperan que los habilites',
          to: '/profe/cuentas',
          alerta: resumen.pendientes > 0,
        },
        {
          valor: resumen.avisaronPago,
          texto: 'avisaron que pagaron',
          to: '/profe/cuentas',
          alerta: resumen.avisaronPago > 0,
        },
        {
          valor: resumen.enGracia + resumen.vencidos,
          texto: 'con la cuota vencida',
          to: '/profe/clientes?pago=vencidos',
          alerta: resumen.enGracia + resumen.vencidos > 0,
        },
        {
          valor: resumen.sinEntrenar,
          texto: `sin entrenar hace ${resumen.diasSinEntrenar}+ días`,
          to: '/profe/clientes',
        },
        ...(gimnasio && resumen.sinProfe > 0
          ? [
              {
                valor: resumen.sinProfe,
                texto: 'sin profe asignado',
                to: '/profe/equipo',
                alerta: true,
              },
            ]
          : []),
      ]
    : []

  return (
    <section className="resumen-espacio">
      <p className="seccion-etiqueta">{gimnasio ? espacio.nombre : 'Tus alumnos'} de un vistazo</p>
      <div className="ajustes-tarjeta">
        <Link to="/profe/suscripcion" className="resumen-espacio-estado">
          <span>Suscripción DREY</span>
          <span className={`estado-chip estado-${estado.tono}`}>{estado.texto}</span>
        </Link>
        <BarraCupos
          total={resumen?.cuposTotal ?? espacio.cuposTotal}
          usados={resumen?.cuposUsados ?? espacio.cuposUsados}
        />
        {numeros.length > 0 && (
          <div className="resumen-espacio-numeros">
            {numeros.map((numero) => (
              <Link
                key={numero.texto}
                to={numero.to}
                className={
                  numero.alerta ? 'resumen-espacio-numero resumen-alerta' : 'resumen-espacio-numero'
                }
              >
                <strong>{numero.valor}</strong>
                <small>{numero.texto}</small>
              </Link>
            ))}
          </div>
        )}
        {gimnasio && (
          <Link to="/profe/equipo" className="boton-secundario boton-chico">
            Ver el equipo y sus alumnos
          </Link>
        )}
      </div>
    </section>
  )
}
