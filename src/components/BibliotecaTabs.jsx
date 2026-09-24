import Pestanas from './Pestanas.jsx'

// Interruptor de la sección Biblioteca del profe: Ejercicios · Plantillas.
export default function BibliotecaTabs({ activa }) {
  return (
    <Pestanas
      etiqueta="Biblioteca"
      activa={activa}
      opciones={[
        { id: 'ejercicios', label: 'Ejercicios', to: '/profe/ejercicios' },
        { id: 'plantillas', label: 'Plantillas de rutina', to: '/profe/plantillas' },
      ]}
    />
  )
}
