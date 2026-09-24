import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import GraficoProgreso from '../components/GraficoProgreso.jsx'
import ResumenProgreso from '../components/ResumenProgreso.jsx'
import { supabase } from '../services/supabaseClient.js'
import {
  generarResumenesPendientes,
  publicarResumen,
  despublicarResumen,
} from '../services/progreso.js'
import {
  ejerciciosEntrenados,
  progresoDeEjercicio,
  volumenPorSemana,
  formatearNumero,
  formatearCambio,
} from '../utils/progreso.js'

// Progresión de un cliente, para el profe:
//   1. Por ejercicio: carga máxima semana a semana (gráfico) y el
//      historial con la comparación contra la semana anterior.
//   2. Volumen total de entrenamiento por semana.
//   3. Resúmenes de cada ciclo de 4 semanas: el profe los revisa, les
//      suma un comentario y los publica para el cliente.
export default function ProfeClienteProgreso() {
  const { id } = useParams()
  const [cargando, setCargando] = useState(true)
  const [cliente, setCliente] = useState(null)
  const [sesiones, setSesiones] = useState([])
  const [resumenes, setResumenes] = useState([])
  const [ejercicioElegido, setEjercicioElegido] = useState('')
  const [comentarios, setComentarios] = useState({})
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargar()
  }, [id])

  async function cargar() {
    setCargando(true)
    await generarResumenesPendientes()
    const [{ data: perfil }, { data: listaSesiones }, { data: listaResumenes }] = await Promise.all(
      [
        supabase.from('perfiles').select('id, nombre, apellido').eq('id', id).single(),
        supabase
          .from('sesiones')
          .select('fecha, esfuerzo, detalle')
          .eq('cliente_id', id)
          .order('fecha'),
        supabase
          .from('resumenes_progreso')
          .select('*')
          .eq('cliente_id', id)
          .order('ciclo', { ascending: false }),
      ],
    )
    setCliente(perfil || null)
    setSesiones(listaSesiones || [])
    setResumenes(listaResumenes || [])
    setComentarios(
      Object.fromEntries((listaResumenes || []).map((r) => [r.id, r.comentario_profe || ''])),
    )
    setCargando(false)
  }

  const ejercicios = useMemo(() => ejerciciosEntrenados(sesiones), [sesiones])
  const elegido = ejercicioElegido || ejercicios[0]?.ejercicio_id || ''
  const historial = useMemo(
    () => (elegido ? progresoDeEjercicio(sesiones, elegido) : []),
    [sesiones, elegido],
  )
  const volumen = useMemo(() => volumenPorSemana(sesiones), [sesiones])

  async function publicar(resumen) {
    setMensaje('')
    const error = await publicarResumen(resumen.id, comentarios[resumen.id])
    if (error) {
      setMensaje('No pudimos publicar el resumen. Probá de nuevo.')
      return
    }
    cargar()
  }

  async function volverABorrador(resumen) {
    const error = await despublicarResumen(resumen.id)
    if (!error) cargar()
  }

  const nombreCliente = cliente ? `${cliente.nombre} ${cliente.apellido}` : 'Cliente'

  return (
    <ProfeLayout
      titulo={`Progresión · ${nombreCliente}`}
      volverA={`/profe/clientes/${id}?tab=progreso`}
    >
      {mensaje && <p className="auth-message">{mensaje}</p>}
      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : sesiones.length === 0 ? (
        <p className="profe-vacio">
          Todavía no completó ninguna rutina. Las gráficas aparecen con el primer entrenamiento.
        </p>
      ) : (
        <>
          <p className="profe-seccion-label">Carga por ejercicio</p>
          <select
            className="profe-calendario-select progreso-selector"
            value={elegido}
            onChange={(event) => setEjercicioElegido(event.target.value)}
            aria-label="Elegir ejercicio"
          >
            {ejercicios.map((ejercicio) => (
              <option key={ejercicio.ejercicio_id} value={ejercicio.ejercicio_id}>
                {ejercicio.nombre}
              </option>
            ))}
          </select>

          <GraficoProgreso
            titulo="Carga máxima por semana"
            unidad=" kg"
            puntos={historial.map((fila) => ({
              etiqueta: etiquetaSemana(fila.semana),
              valor: fila.kgMax,
            }))}
          />

          <div className="profe-tabla-wrap">
            <table className="profe-tabla">
              <thead>
                <tr>
                  <th>Semana</th>
                  <th>Mejor serie</th>
                  <th>Volumen</th>
                  <th>vs. anterior</th>
                </tr>
              </thead>
              <tbody>
                {[...historial].reverse().map((fila) => (
                  <tr key={fila.semana}>
                    <td>{etiquetaSemana(fila.semana)}</td>
                    <td>
                      {formatearNumero(fila.mejorSerie.kg)} kg × {fila.mejorSerie.reps}
                    </td>
                    <td>{formatearNumero(fila.volumen)} kg</td>
                    <td className={claseCambio(fila.cambioKg)}>{formatearCambio(fila.cambioKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="profe-seccion-label">Volumen total por semana</p>
          <GraficoProgreso
            tipo="barras"
            titulo="Volumen de entrenamiento (kg × reps)"
            puntos={volumen.map((fila) => ({
              etiqueta: etiquetaSemana(fila.semana),
              valor: Math.round(fila.volumen),
            }))}
          />
        </>
      )}

      {!cargando && (
        <>
          <p className="profe-seccion-label">Resúmenes de 4 semanas</p>
          {resumenes.length === 0 ? (
            <p className="profe-vacio">
              El primer resumen aparece solo cuando se cumplan 4 semanas desde su primer
              entrenamiento.
            </p>
          ) : (
            resumenes.map((resumen) => (
              <div key={resumen.id} className="resumen-caja">
                <p
                  className={
                    resumen.estado === 'publicado'
                      ? 'resumen-estado resumen-estado-publicado'
                      : 'resumen-estado'
                  }
                >
                  {resumen.estado === 'publicado'
                    ? `Publicado${resumen.visto ? ' · el cliente ya lo vio' : ''}`
                    : 'Borrador: revisalo y publicalo'}
                </p>
                <ResumenProgreso resumen={resumen} />
                {resumen.estado === 'borrador' ? (
                  <div className="resumen-acciones">
                    <textarea
                      className="form-textarea"
                      placeholder="Comentario para el cliente (opcional)"
                      value={comentarios[resumen.id] || ''}
                      onChange={(event) =>
                        setComentarios((actual) => ({
                          ...actual,
                          [resumen.id]: event.target.value,
                        }))
                      }
                    />
                    <button type="button" className="pill-button" onClick={() => publicar(resumen)}>
                      Aprobar y publicar al cliente
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="profe-cerrar-selector"
                    onClick={() => volverABorrador(resumen)}
                  >
                    Volver a borrador (ocultar al cliente)
                  </button>
                )}
              </div>
            ))
          )}
        </>
      )}
    </ProfeLayout>
  )
}

function etiquetaSemana(lunesISO) {
  const fecha = new Date(`${lunesISO}T00:00:00`)
  return `${fecha.getDate()}/${fecha.getMonth() + 1}`
}

function claseCambio(cambio) {
  if (cambio == null || cambio === 0) return ''
  return cambio > 0 ? 'resumen-sube' : 'resumen-baja'
}
