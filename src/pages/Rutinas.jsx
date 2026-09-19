import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import ClienteHeader from '../components/ClienteHeader.jsx'
import RutinaCard from '../components/RutinaCard.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { obtenerPlan } from '../data/planes.js'
import { DIAS_SEMANA } from '../utils/dias.js'

export default function Rutinas() {
  const navigate = useNavigate()
  const [cargando, setCargando] = useState(true)
  const [perfil, setPerfil] = useState(null)
  const [rutinas, setRutinas] = useState([])
  const [calendario, setCalendario] = useState([])
  const [mostrarOrganizacion, setMostrarOrganizacion] = useState(false)

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

    const [{ data: perfilData }, { data: rutinasData }, { data: calendarioData }] =
      await Promise.all([
        supabase.from('perfiles').select('*').eq('id', usuario.id).single(),
        supabase.from('rutinas').select('*').eq('cliente_id', usuario.id).order('orden'),
        supabase
          .from('calendario_cliente')
          .select('*, rutinas(nombre)')
          .eq('cliente_id', usuario.id),
      ])

    setPerfil(perfilData || null)
    setRutinas(rutinasData || [])
    setCalendario(calendarioData || [])
    setCargando(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  if (cargando) {
    return (
      <div className="screen has-bottom-nav">
        <p className="profe-mensaje-carga">Cargando…</p>
        <BottomNav />
      </div>
    )
  }

  const nombre = perfil ? `${perfil.nombre} ${perfil.apellido}` : 'Hola'
  const diasEntrenamiento = calendario.filter((item) => item.rutina_id).length

  return (
    <div className="screen has-bottom-nav">
      <ClienteHeader
        objetivo={perfil?.objetivo}
        nombre={nombre}
        plan={obtenerPlan(perfil?.plan)?.nombre || 'Sin plan'}
        diasEntrenamiento={diasEntrenamiento}
        onLogout={handleLogout}
      />

      {rutinas.length === 0 ? (
        <p className="profe-vacio" style={{ textAlign: 'center', margin: '2rem 1.5rem' }}>
          Todavía no tenés rutinas asignadas. Tu profe te las va a armar pronto.
        </p>
      ) : (
        <div className="rutinas-grid">
          {rutinas.map((rutina) => (
            <RutinaCard key={rutina.id} {...rutina} />
          ))}
        </div>
      )}

      <button
        type="button"
        className="organizacion-toggle"
        onClick={() => setMostrarOrganizacion((value) => !value)}
      >
        Organización {mostrarOrganizacion ? '▲' : '▼'}
      </button>

      {mostrarOrganizacion && (
        <div className="organizacion-calendario">
          {DIAS_SEMANA.map((dia) => {
            const item = calendario.find((fila) => fila.dia === dia)
            const nombreRutina = item?.rutinas?.nombre || 'Descanso'
            return (
              <div key={dia} className="organizacion-dia">
                <span className="organizacion-dia-nombre">{dia}</span>
                <span
                  className={
                    nombreRutina === 'Descanso'
                      ? 'organizacion-dia-rutina organizacion-dia-descanso'
                      : 'organizacion-dia-rutina'
                  }
                >
                  {nombreRutina}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <BottomNav />
    </div>
  )
}
