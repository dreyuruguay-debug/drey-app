import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import GraficoProgreso from '../components/GraficoProgreso.jsx'
import NotificacionAvance from '../components/NotificacionAvance.jsx'
import { calcularRachaSemanas, textoFechaCorta } from '../utils/dias.js'
import {
  ejerciciosEntrenados,
  formatearNumero,
  progresoDeEjercicio,
  recordsPorEjercicio,
  volumenPorSemana,
} from '../utils/progreso.js'

const RECORDS_A_MOSTRAR = 5

// "Progreso" del cliente: cuánto entrenó, sus récords, cómo viene
// subiendo la carga en cada ejercicio y los resúmenes de 4 semanas que
// publicó su profe. Todo sale de la tabla "sesiones".
export default function Progreso() {
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [usuarioId, setUsuarioId] = useState(null)
  const [sesiones, setSesiones] = useState([])
  const [ejercicioElegido, setEjercicioElegido] = useState('')

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    const { data: userData } = await supabase.auth.getUser()
    const usuario = userData?.user
    if (!usuario) {
      navigate('/')
      return
    }
    setUsuarioId(usuario.id)
    const { data } = await supabase
      .from('sesiones')
      .select('fecha, detalle')
      .eq('cliente_id', usuario.id)
      .order('fecha')
    setSesiones(data || [])
    setCargando(false)
  }

  const ejercicios = useMemo(() => ejerciciosEntrenados(sesiones), [sesiones])
  const records = useMemo(() => recordsPorEjercicio(sesiones), [sesiones])
  const volumen = useMemo(() => volumenPorSemana(sesiones), [sesiones])
  const elegido = ejercicioElegido || ejercicios[0]?.ejercicio_id || ''
  const historial = useMemo(
    () => (elegido ? progresoDeEjercicio(sesiones, elegido) : []),
    [sesiones, elegido],
  )
  const racha = calcularRachaSemanas(sesiones.map((sesion) => sesion.fecha))

  return (
    <div className="screen has-bottom-nav pagina-cliente">
      <TopPattern />
      <h1 className="pagina-titulo">Mi progreso</h1>

      {cargando ? (
        <p className="profe-mensaje-carga">Cargando…</p>
      ) : sesiones.length === 0 ? (
        <div className="hoy-tarjeta hoy-tarjeta-mensaje">
          <h2 className="hoy-mensaje-titulo">Todavía no hay datos</h2>
          <p className="hoy-mensaje-texto">
            Después de tu primer entrenamiento vas a ver acá tus récords y cómo venís progresando.
          </p>
          <Link to="/inicio" className="boton-principal">
            Ir a entrenar
          </Link>
        </div>
      ) : (
        <>
          <section className="inicio-datos inicio-datos-tres">
            <div className="dato-tarjeta">
              <span className="dato-etiqueta">Sesiones</span>
              <strong className="dato-valor">{sesiones.length}</strong>
            </div>
            <div className="dato-tarjeta">
              <span className="dato-etiqueta">Racha</span>
              <strong className="dato-valor">{racha} sem.</strong>
            </div>
            <div className="dato-tarjeta">
              <span className="dato-etiqueta">Marcas</span>
              <strong className="dato-valor">{records.length}</strong>
            </div>
          </section>

          <section className="bloque-pagina">
            <p className="seccion-etiqueta">Tus mejores marcas</p>
            <div className="lista-tarjetas">
              {records.slice(0, RECORDS_A_MOSTRAR).map((record) => (
                <div key={record.ejercicio_id} className="tarjeta-record">
                  <span className="tarjeta-record-icono" aria-hidden="true">
                    🏆
                  </span>
                  <span className="tarjeta-rutina-textos">
                    <strong>{record.nombre}</strong>
                    <small>{textoFechaCorta(record.fecha)}</small>
                  </span>
                  <strong className="tarjeta-record-valor">
                    {record.kg
                      ? `${formatearNumero(record.kg)} kg × ${record.reps}`
                      : `${record.reps} reps`}
                  </strong>
                </div>
              ))}
            </div>
          </section>

          <section className="bloque-pagina">
            <p className="seccion-etiqueta">Cómo sube tu carga</p>
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
                etiqueta: textoFechaCorta(fila.semana),
                valor: fila.kgMax,
              }))}
            />
          </section>

          <section className="bloque-pagina">
            <p className="seccion-etiqueta">Cuánto entrenaste cada semana</p>
            <GraficoProgreso
              tipo="barras"
              titulo="Volumen (kg × repeticiones)"
              puntos={volumen.map((fila) => ({
                etiqueta: textoFechaCorta(fila.semana),
                valor: Math.round(fila.volumen),
              }))}
            />
          </section>
        </>
      )}

      {!cargando && usuarioId && (
        <div className="bloque-pagina">
          <NotificacionAvance clienteId={usuarioId} />
        </div>
      )}

      <BottomNav />
    </div>
  )
}
