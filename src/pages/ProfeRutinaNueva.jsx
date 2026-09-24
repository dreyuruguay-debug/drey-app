import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import PasosAsistente from '../components/PasosAsistente.jsx'
import SelectorGrupos from '../components/SelectorGrupos.jsx'
import { supabase } from '../services/supabaseClient.js'
import { crearRutina, cargarPlantilla, copiarEjercicios } from '../services/rutinas.js'
import { textoGrupos } from '../data/gruposMusculares.js'
import { PASOS_RUTINA, EJEMPLOS_NOMBRE } from '../data/asistente.js'

// Pasos 1 (nombre) y 2 (grupos musculares) del asistente para crear una
// rutina de un cliente o una plantilla. Al terminar el paso 2 se crea la
// rutina y se abre el paso 3: el editor (ProfeRutinaEditor), que ya
// muestra la rutina como la va a ver el cliente, todavía vacía.
//
// tipo = 'rutina'    → /profe/rutinas/nueva/:clienteId
// tipo = 'plantilla' → /profe/plantillas/nueva
export default function ProfeRutinaNueva({ tipo }) {
  const { clienteId } = useParams()
  const navigate = useNavigate()
  const esRutina = tipo === 'rutina'

  const [paso, setPaso] = useState(0)
  const [nombre, setNombre] = useState('')
  const [grupos, setGrupos] = useState([])
  const [cliente, setCliente] = useState(null)
  const [plantillas, setPlantillas] = useState([])
  const [plantillaId, setPlantillaId] = useState('')
  const [datosPlantilla, setDatosPlantilla] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    if (!esRutina) return
    Promise.all([
      supabase.from('perfiles').select('nombre, apellido').eq('id', clienteId).single(),
      supabase.from('plantillas').select('id, nombre').order('creado_en'),
    ]).then(([{ data: perfil }, { data: lista }]) => {
      setCliente(perfil || null)
      setPlantillas(lista || [])
    })
  }, [esRutina, clienteId])

  // Al elegir una plantilla se completan el nombre y los grupos con los
  // de la plantilla (se pueden cambiar igual).
  async function elegirPlantilla(id) {
    setPlantillaId(id)
    if (!id) {
      setDatosPlantilla(null)
      return
    }
    const datos = await cargarPlantilla(id)
    setDatosPlantilla(datos)
    if (datos) {
      if (!nombre.trim()) setNombre(datos.nombre || '')
      if (datos.grupos_musculares?.length) setGrupos(datos.grupos_musculares)
    }
  }

  function irAlPaso2(event) {
    event.preventDefault()
    if (!nombre.trim()) {
      setMensaje('Escribí un nombre para la rutina.')
      return
    }
    setMensaje('')
    setPaso(1)
  }

  async function crear() {
    if (grupos.length === 0) {
      setMensaje('Elegí al menos un grupo muscular.')
      return
    }
    setCreando(true)
    setMensaje('')
    const { data, error } = await crearRutina(
      tipo,
      {
        ...(datosPlantilla || {}),
        nombre: nombre.trim(),
        grupos_musculares: grupos,
        musculos: textoGrupos(grupos),
      },
      clienteId,
    )
    if (error) {
      setCreando(false)
      setMensaje(`No pudimos crear la ${tipo}. Probá de nuevo.`)
      return
    }
    // Si arrancó desde una plantilla, le copia sus ejercicios. De acá en
    // adelante es una rutina independiente: cambiarla no toca la plantilla.
    if (plantillaId) await copiarEjercicios('plantilla', plantillaId, 'rutina', data.id)
    navigate(esRutina ? `/profe/rutinas/${data.id}` : `/profe/plantillas/${data.id}`, {
      replace: true,
    })
  }

  const volverA = esRutina ? `/profe/clientes/${clienteId}?tab=rutinas` : '/profe/plantillas'
  const titulo = esRutina ? 'Nueva rutina' : 'Nueva plantilla'

  return (
    <ProfeLayout titulo={titulo} volverA={volverA}>
      {esRutina && cliente && (
        <p className="profe-nota">
          Para {cliente.nombre} {cliente.apellido}
        </p>
      )}

      <div className="asistente-pasos-pagina">
        <PasosAsistente pasos={PASOS_RUTINA} actual={paso} etiqueta="Pasos para crear la rutina" />
      </div>

      {paso === 0 && (
        <form className="asistente-paso" onSubmit={irAlPaso2}>
          <p className="asistente-pregunta">Nombre de la {tipo}</p>
          <input
            className="auth-input"
            type="text"
            placeholder="Ej: Full Body"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            autoFocus
          />
          <div className="chips-lista">
            {EJEMPLOS_NOMBRE.map((ejemplo) => (
              <button
                key={ejemplo}
                type="button"
                className="chip chip-sugerencia"
                onClick={() => setNombre(ejemplo)}
              >
                {ejemplo}
              </button>
            ))}
          </div>

          {esRutina && plantillas.length > 0 && (
            <label className="editor-campo asistente-plantilla">
              <span>¿Querés empezar desde una plantilla? (opcional)</span>
              <select
                className="profe-calendario-select"
                value={plantillaId}
                onChange={(event) => elegirPlantilla(event.target.value)}
              >
                <option value="">No, empezar de cero</option>
                {plantillas.map((plantilla) => (
                  <option key={plantilla.id} value={plantilla.id}>
                    Usar plantilla: {plantilla.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mensaje && <p className="auth-message">{mensaje}</p>}
          <div className="asistente-botones">
            <span />
            <button type="submit" className="pill-button asistente-siguiente">
              Siguiente
            </button>
          </div>
        </form>
      )}

      {paso === 1 && (
        <div className="asistente-paso">
          <p className="asistente-pregunta">Grupos musculares a trabajar</p>
          <p className="profe-nota">
            Podés elegir varios. Después se usan para recomendarte los ejercicios.
          </p>
          <SelectorGrupos seleccionados={grupos} onCambiar={setGrupos} />
          {mensaje && <p className="auth-message">{mensaje}</p>}
          <div className="asistente-botones">
            <button
              type="button"
              className="registro-boton-secundario"
              onClick={() => {
                setMensaje('')
                setPaso(0)
              }}
            >
              ← Atrás
            </button>
            <button
              type="button"
              className="pill-button asistente-siguiente"
              onClick={crear}
              disabled={creando}
            >
              {creando ? 'Creando…' : 'Siguiente'}
            </button>
          </div>
        </div>
      )}
    </ProfeLayout>
  )
}
