import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import { supabase } from '../services/supabaseClient.js'
import { cargarCalendarioCliente, guardarDiasDeRutina } from '../services/rutinas.js'
import { mostrarAviso } from '../services/avisos.js'
import { DIAS_SEMANA } from '../utils/dias.js'
import { linkWhatsApp } from '../utils/whatsapp.js'
import Esqueleto from '../components/Esqueleto.jsx'

// Último paso al guardar una rutina: "¿Qué días hace Juan esta rutina?".
// Se marcan los días (se ve qué tiene ya cada día) y con "Listo" se
// guarda en el calendario del cliente y, si tiene celular, se abre
// WhatsApp con un mensaje para avisarle. También se entra desde
// "Asignar días" en el editor o en la ficha del cliente.
export default function ProfeRutinaDias() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const [cargando, setCargando] = useState(true)
  const [rutina, setRutina] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [calendario, setCalendario] = useState({})
  const [elegidos, setElegidos] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargar()
  }, [id])

  useEffect(() => {
    if (state?.recienGuardada) mostrarAviso('Rutina guardada')
  }, [])

  async function cargar() {
    setCargando(true)
    const { data: datos } = await supabase
      .from('rutinas')
      .select('id, nombre, cliente_id')
      .eq('id', id)
      .single()
    if (!datos) {
      setCargando(false)
      return
    }
    const [{ data: perfil }, porDia] = await Promise.all([
      supabase
        .from('perfiles')
        .select('id, nombre, apellido, celular')
        .eq('id', datos.cliente_id)
        .single(),
      cargarCalendarioCliente(datos.cliente_id),
    ])
    setRutina(datos)
    setCliente(perfil || null)
    setCalendario(porDia)
    setElegidos(DIAS_SEMANA.filter((dia) => porDia[dia]?.rutina_id === id))
    setCargando(false)
  }

  function alternar(dia) {
    setElegidos((actual) =>
      actual.includes(dia) ? actual.filter((item) => item !== dia) : [...actual, dia],
    )
  }

  const fichaCliente = rutina
    ? `/profe/clientes/${rutina.cliente_id}?tab=rutinas`
    : '/profe/clientes'
  const whatsapp = linkWhatsApp(
    cliente?.celular,
    `Hola ${cliente?.nombre || ''}! Ya tenés tu rutina "${rutina?.nombre || ''}" en DREY${
      elegidos.length ? ` para los ${elegidos.join(', ').toLowerCase()}` : ''
    }. Entrá a la app para verla. ¡A entrenar! 💪`,
  )

  async function guardar(avisar) {
    setGuardando(true)
    setMensaje('')
    const error = await guardarDiasDeRutina(rutina.cliente_id, id, elegidos, calendario)
    setGuardando(false)
    if (error) {
      setMensaje('No pudimos guardar los días. Revisá tu conexión y probá de nuevo.')
      return
    }
    mostrarAviso(elegidos.length ? 'Días guardados' : 'Guardado sin días asignados')
    if (avisar && whatsapp) window.open(whatsapp, '_blank', 'noopener')
    navigate(fichaCliente)
  }

  return (
    <ProfeLayout volverA={fichaCliente}>
      {cargando ? (
        <Esqueleto />
      ) : !rutina ? (
        <p className="profe-vacio">No encontramos esta rutina.</p>
      ) : (
        <div className="asistente-paso">
          <span className="hoy-etiqueta">{state?.recienGuardada ? 'Último paso' : 'Días'}</span>
          <h1 className="pagina-titulo pagina-titulo-sin-margen">
            ¿Qué días hace {cliente?.nombre || 'el cliente'} esta rutina?
          </h1>
          <p className="profe-nota">{rutina.nombre}</p>

          <div className="dias-lista" role="group" aria-label="Días de la semana">
            {DIAS_SEMANA.map((dia) => {
              const marcado = elegidos.includes(dia)
              const otra = calendario[dia]?.rutina_id && calendario[dia].rutina_id !== id
              const nombreOtra = calendario[dia]?.rutinas?.nombre
              let detalle = 'Descanso'
              if (marcado) detalle = otra ? `Esta rutina (reemplaza ${nombreOtra})` : 'Esta rutina'
              else if (otra) detalle = `Ya tiene ${nombreOtra || 'otra rutina'}`
              return (
                <button
                  key={dia}
                  type="button"
                  className={marcado ? 'dia-opcion dia-opcion-activa' : 'dia-opcion'}
                  onClick={() => alternar(dia)}
                  aria-pressed={marcado}
                >
                  <span className="dia-check">{marcado ? '✓' : ''}</span>
                  <strong>{dia}</strong>
                  <small>{detalle}</small>
                </button>
              )
            })}
          </div>

          {mensaje && <p className="auth-message">{mensaje}</p>}

          <button
            type="button"
            className="boton-principal"
            onClick={() => guardar(true)}
            disabled={guardando}
          >
            {guardando
              ? 'Guardando…'
              : whatsapp
                ? `Listo, avisarle a ${cliente?.nombre || 'tu cliente'}`
                : 'Listo'}
          </button>
          {whatsapp && (
            <button
              type="button"
              className="boton-texto"
              onClick={() => guardar(false)}
              disabled={guardando}
            >
              Guardar sin avisarle
            </button>
          )}
          <button type="button" className="boton-texto" onClick={() => navigate(fichaCliente)}>
            Lo asigno después
          </button>
        </div>
      )}
    </ProfeLayout>
  )
}
