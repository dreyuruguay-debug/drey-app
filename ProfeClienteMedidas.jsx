import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import PanelMedidas from '../components/PanelMedidas.jsx'
import { supabase } from '../services/supabaseClient.js'

// Medidas de un cliente, vistas por su profe (ficha → Progreso →
// "Medidas y fotos"). Desde acá el profe carga la evaluación inicial y
// los controles. Ver components/PanelMedidas.jsx.
export default function ProfeClienteMedidas() {
  const { id } = useParams()
  const [nombre, setNombre] = useState('')

  useEffect(() => {
    supabase
      .from('perfiles')
      .select('nombre, apellido')
      .eq('id', id)
      .single()
      .then(({ data }) => setNombre(data ? `${data.nombre} ${data.apellido}` : ''))
  }, [id])

  return (
    <ProfeLayout titulo={nombre ? `Medidas de ${nombre}` : 'Medidas'} volverA={`/profe/clientes/${id}?tab=progreso`}>
      <PanelMedidas clienteId={id} esProfe />
    </ProfeLayout>
  )
}
