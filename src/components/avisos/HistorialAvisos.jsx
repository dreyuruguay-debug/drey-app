import { useEffect, useMemo, useState } from 'react'
import Esqueleto from '../Esqueleto.jsx'
import { cargarHistorialDeAvisos, faltaInstalar } from '../../services/avisosAdmin.js'
import { fechaLocalISO, textoFechaCorta } from '../../utils/dias.js'

// "Enviadas" del administrador de notificaciones: las últimas 100 que
// salieron o están por salir, agrupadas por día, con su estado:
//   Enviada · Sale a tal hora (programada) · En cola · No se pudo enviar /
//   No salió (más de un día en la cola).
// Los avisos de fin del descanso no se muestran (son muchísimos).
// Solo aparecen las de quienes tienen las notificaciones activadas: a
// los demás no se les anota nada.
export default function HistorialAvisos() {
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState(null)
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    cargarHistorialDeAvisos(100).then((resultado) => {
      setFilas(resultado.filas)
      setError(resultado.error)
    })
  }, [])

  const tipos = useMemo(() => {
    const nombres = new Map((filas || []).map((fila) => [fila.tipo, fila.nombre_tipo]))
    return [...nombres.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [filas])

  const porDia = useMemo(() => {
    const grupos = new Map()
    for (const fila of filas || []) {
      if (filtro && fila.tipo !== filtro) continue
      const fecha = new Date(fila.creado_en)
      const dia = fechaLocalISO(fecha)
      if (!grupos.has(dia)) grupos.set(dia, [])
      grupos.get(dia).push(fila)
    }
    return [...grupos.entries()]
  }, [filas, filtro])

  if (!filas && !error) return <Esqueleto />
  if (error) {
    return (
      <p className="profe-vacio">
        {faltaInstalar(error)
          ? 'Falta instalar la actualización de la base (SQL 030).'
          : 'No pudimos cargar las notificaciones enviadas.'}
      </p>
    )
  }

  return (
    <>
      <select
        className="profe-calendario-select estadisticas-filtro"
        value={filtro}
        onChange={(event) => setFiltro(event.target.value)}
        aria-label="Qué notificaciones ver"
      >
        <option value="">Todas</option>
        {tipos.map(([tipo, nombre]) => (
          <option key={tipo} value={tipo}>
            {nombre}
          </option>
        ))}
      </select>

      {porDia.length === 0 ? (
        <p className="profe-vacio">Todavía no salió ninguna notificación.</p>
      ) : (
        porDia.map(([dia, avisos]) => (
          <section key={dia} className="bloque-pagina">
            <p className="profe-seccion-label">{textoFechaCorta(dia)}</p>
            <div className="lista-tarjetas">
              {avisos.map((aviso) => {
                const estado = estadoDe(aviso)
                return (
                  <div key={aviso.id} className="historial-item aviso-enviado">
                    <span className="historial-hora">{hora(aviso.creado_en)}</span>
                    <span className="historial-textos">
                      <small>
                        {aviso.nombre_tipo} · {aviso.destinatario}
                      </small>
                      <span>{aviso.titulo}</span>
                      {aviso.cuerpo && (
                        <small className="aviso-enviado-cuerpo">{aviso.cuerpo}</small>
                      )}
                    </span>
                    <span className={`aviso-estado aviso-estado-${estado.tipo}`}>
                      {estado.texto}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}
    </>
  )
}

function hora(fecha) {
  return new Date(fecha).toLocaleTimeString('es-UY', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

function estadoDe(aviso) {
  if (aviso.enviado_en) return { tipo: 'ok', texto: 'Enviada' }
  if (aviso.intentos >= 5) return { tipo: 'error', texto: 'No se pudo enviar' }
  // La cola descarta lo que tiene más de un día sin salir.
  if (Date.now() - new Date(aviso.creado_en).getTime() > 24 * 3600 * 1000) {
    return { tipo: 'error', texto: 'No salió' }
  }
  if (new Date(aviso.enviar_desde) > new Date()) {
    return { tipo: 'espera', texto: `Sale ${hora(aviso.enviar_desde)}` }
  }
  return { tipo: 'espera', texto: 'En cola' }
}
