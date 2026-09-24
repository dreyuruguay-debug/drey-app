import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import EditorEjerciciosRutina from '../components/EditorEjerciciosRutina.jsx'
import { supabase } from '../services/supabaseClient.js'
import { ORIGENES } from '../services/rutinas.js'

// Pantalla propia para armar una rutina (de un cliente) o una plantilla.
// Arriba: nombre, patrón, músculos y descripción. Abajo: los bloques de
// ejercicios con su método (ver EditorEjerciciosRutina).
//
// tipo = 'rutina'    → /profe/clientes/:clienteId/rutinas/:id
// tipo = 'plantilla' → /profe/plantillas/:id
export default function ProfeRutinaEditor({ tipo }) {
  const { id, clienteId } = useParams()
  const origen = ORIGENES[tipo]
  const [cargando, setCargando] = useState(true)
  const [datos, setDatos] = useState(null)
  const [planCliente, setPlanCliente] = useState(null)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    cargar()
  }, [tipo, id])

  async function cargar() {
    setCargando(true)
    const [{ data }, { data: cliente }] = await Promise.all([
      supabase.from(origen.tabla).select('*').eq('id', id).single(),
      clienteId
        ? supabase.from('perfiles').select('plan').eq('id', clienteId).single()
        : Promise.resolve({ data: null }),
    ])
    setDatos(data || null)
    setPlanCliente(cliente?.plan || null)
    setCargando(false)
  }

  function cambiarLocal(campo, valor) {
    setDatos((actual) => ({ ...actual, [campo]: valor }))
  }

  async function guardarDatos() {
    if (!datos.nombre?.trim()) {
      setMensaje('La rutina necesita un nombre.')
      return
    }
    const { error } = await supabase
      .from(origen.tabla)
      .update({
        nombre: datos.nombre.trim(),
        patron: datos.patron || null,
        musculos: datos.musculos || null,
        descripcion: datos.descripcion || null,
      })
      .eq('id', id)
    setMensaje(error ? 'No pudimos guardar los datos. Probá de nuevo.' : '')
  }

  const volverA = tipo === 'rutina' ? `/profe/clientes/${clienteId}` : '/profe/plantillas'
  const titulo = tipo === 'rutina' ? 'Editar rutina' : 'Editar plantilla'

  return (
    <ProfeLayout titulo={titulo} volverA={volverA}>
      {cargando ? (
        <p className="profe-vacio">Cargando…</p>
      ) : !datos ? (
        <p className="profe-vacio">No encontramos esta {tipo}.</p>
      ) : (
        <>
          {mensaje && <p className="auth-message">{mensaje}</p>}
          <div className="editor-datos">
            <input
              className="auth-input editor-datos-nombre"
              type="text"
              placeholder="Nombre (ej: Rutina A)"
              value={datos.nombre || ''}
              onChange={(event) => cambiarLocal('nombre', event.target.value)}
              onBlur={guardarDatos}
            />
            <div className="form-row">
              <input
                className="auth-input"
                type="text"
                placeholder="Patrón (ej: Empuje)"
                value={datos.patron || ''}
                onChange={(event) => cambiarLocal('patron', event.target.value)}
                onBlur={guardarDatos}
              />
              <input
                className="auth-input"
                type="text"
                placeholder="Músculos (ej: Pecho, hombro, tríceps)"
                value={datos.musculos || ''}
                onChange={(event) => cambiarLocal('musculos', event.target.value)}
                onBlur={guardarDatos}
              />
            </div>
            <textarea
              className="form-textarea"
              placeholder="Descripción (opcional): objetivo de la rutina, indicaciones generales…"
              value={datos.descripcion || ''}
              onChange={(event) => cambiarLocal('descripcion', event.target.value)}
              onBlur={guardarDatos}
            />
          </div>

          <p className="profe-seccion-label">Ejercicios</p>
          <EditorEjerciciosRutina
            tipo={tipo}
            padreId={id}
            mostrarKgObjetivo={planCliente !== 'rutina'}
          />
        </>
      )}
    </ProfeLayout>
  )
}
