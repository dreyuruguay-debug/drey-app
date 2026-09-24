import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { DIAS_SEMANA, abreviaturaDia, obtenerNombreDiaHoy } from '../utils/dias.js'

// "Mis rutinas" del cliente: cada rutina con los días en que le toca y,
// abajo, su semana completa. Al tocar una rutina se ve entera y desde
// ahí se empieza a entrenar.
export default function Rutinas() {
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [rutinas, setRutinas] = useState([])
  const [calendario, setCalendario] = useState({})

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setCargando(true)
    const { data: userData } = await supabase.auth.getUser()
    const usuario = userData?.user
    if (!usuario) {
      navigate('/')
      return
    }
    const [{ data: rutinasData }, { data: calendarioData }] = await Promise.all([
      supabase.from('rutinas').select('*').eq('cliente_id', usuario.id).order('orden'),
      supabase.from('calendario_cliente').select('*, rutinas(nombre)').eq('cliente_id', usuario.id),
    ])
    const porDia = {}
    for (const fila of calendarioData || []) porDia[fila.dia] = fila
    setRutinas(rutinasData || [])
    setCalendario(porDia)
    setCargando(false)
  }

  const diaHoy = obtenerNombreDiaHoy()
  const diasDe = (rutinaId) => DIAS_SEMANA.filter((dia) => calendario[dia]?.rutina_id === rutinaId)
  const hayDias = DIAS_SEMANA.some((dia) => calendario[dia]?.rutina_id)

  return (
    <div className="screen has-bottom-nav pagina-cliente">
      <TopPattern />
      <h1 className="pagina-titulo">Mis rutinas</h1>

      {cargando ? (
        <p className="profe-mensaje-carga">Cargando…</p>
      ) : rutinas.length === 0 ? (
        <div className="hoy-tarjeta hoy-tarjeta-mensaje">
          <h2 className="hoy-mensaje-titulo">Tu profe está armando tu rutina</h2>
          <p className="hoy-mensaje-texto">
            Apenas esté lista la vas a ver acá. Mientras tanto, completá tus datos para que te
            conozca mejor.
          </p>
          <Link to="/mis-datos" className="boton-principal">
            Completar mis datos
          </Link>
        </div>
      ) : (
        <>
          <div className="lista-tarjetas">
            {rutinas.map((rutina) => {
              const dias = diasDe(rutina.id)
              const esHoy = dias.includes(diaHoy)
              return (
                <Link
                  key={rutina.id}
                  to={`/rutinas/${rutina.id}?vista=completa`}
                  className={esHoy ? 'tarjeta-rutina tarjeta-rutina-hoy' : 'tarjeta-rutina'}
                >
                  <span className="tarjeta-rutina-textos">
                    {esHoy && <span className="hoy-etiqueta">Hoy</span>}
                    <strong>{rutina.nombre}</strong>
                    {(rutina.musculos || rutina.patron) && (
                      <small>{rutina.musculos || rutina.patron}</small>
                    )}
                    {dias.length > 0 && (
                      <span className="chips-lista">
                        {dias.map((dia) => (
                          <span key={dia} className="chip chip-dato chip-chico">
                            {abreviaturaDia(dia)}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                  <span className="tarjeta-flecha" aria-hidden="true">
                    ›
                  </span>
                </Link>
              )
            })}
          </div>

          {hayDias && (
            <section className="tu-semana">
              <p className="seccion-etiqueta">Tu semana</p>
              {DIAS_SEMANA.map((dia) => {
                const nombre = calendario[dia]?.rutinas?.nombre
                return (
                  <div
                    key={dia}
                    className={dia === diaHoy ? 'tu-semana-dia tu-semana-hoy' : 'tu-semana-dia'}
                  >
                    <span>{dia}</span>
                    <span className={nombre ? '' : 'tu-semana-descanso'}>
                      {nombre || 'Descanso'}
                    </span>
                  </div>
                )
              })}
            </section>
          )}
        </>
      )}

      <BottomNav />
    </div>
  )
}
