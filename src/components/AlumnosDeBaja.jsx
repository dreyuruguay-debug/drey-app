import { useEffect, useState } from 'react'
import { cargarAlumnosDeBaja, textoDeErrorDeBaja, volverASumar } from '../services/bajas.js'
import { mostrarAviso } from '../services/avisos.js'
import { textoFechaCorta } from '../utils/dias.js'

// "Alumnos dados de baja" (al pie de Clientes): los que el profe dio de
// baja porque ya no siguen. No aparecen en ninguna otra lista del panel.
// Conservan su cuenta y su historial; con "Volver a sumar" quedan
// pendientes, y se habilitan desde Cobros como una cuenta nueva.
// Si no hay ninguno, no se muestra nada. Ver services/bajas.js.
//   onCambio: se llama después de volver a sumar a uno.
export default function AlumnosDeBaja({ onCambio }) {
  const [alumnos, setAlumnos] = useState([])
  const [ocupado, setOcupado] = useState(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const resultado = await cargarAlumnosDeBaja()
    setAlumnos(resultado.alumnos)
  }

  async function sumar(alumno) {
    setOcupado(alumno.id)
    const error = await volverASumar(alumno.id)
    setOcupado(null)
    if (error) {
      mostrarAviso(textoDeErrorDeBaja(error), 'error')
      return
    }
    mostrarAviso(`${alumno.nombre} volvió: habilitalo desde Cobros`)
    setAlumnos((lista) => lista.filter((otro) => otro.id !== alumno.id))
    onCambio?.()
  }

  if (alumnos.length === 0) return null

  return (
    <details className="alumnos-de-baja">
      <summary>Alumnos dados de baja ({alumnos.length})</summary>
      <p className="profe-nota">
        Ya no siguen, pero conservan su cuenta y su historial. Si alguno vuelve, tocá “Volver a
        sumar” y después habilitalo desde Cobros.
      </p>
      <div className="lista-tarjetas">
        {alumnos.map((alumno) => (
          <div key={alumno.id} className="profe-cliente-card">
            <div>
              <p className="profe-cliente-nombre">
                {alumno.nombre} {alumno.apellido}
              </p>
              <p className="profe-cliente-detalle">
                {alumno.baja_en ? `De baja desde el ${textoFechaCorta(alumno.baja_en)}` : 'De baja'}
              </p>
            </div>
            <button
              type="button"
              className="boton-secundario boton-chico"
              onClick={() => sumar(alumno)}
              disabled={ocupado === alumno.id}
            >
              {ocupado === alumno.id ? 'Sumando…' : 'Volver a sumar'}
            </button>
          </div>
        ))}
      </div>
    </details>
  )
}
