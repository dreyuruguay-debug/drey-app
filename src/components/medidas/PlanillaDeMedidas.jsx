import { useState } from 'react'
import {
  TIPO_XLSX,
  crearPlanillaDeMedidas,
  guardarCargaDeMedidas,
  leerPlanillaDeMedidas,
} from '../../services/planillaMedidas.js'
import { mostrarAviso } from '../../services/avisos.js'
import {
  filasParaPlanilla,
  leerPlanilla,
  planDeCarga,
  textoDelPlan,
} from '../../utils/planillaMedidas.js'
import { descargarBlob } from '../../utils/descargas.js'
import { obtenerFechaHoyISO } from '../../utils/dias.js'

// "Valoración antropométrica en Excel": bajar la planilla (con lo que ya
// está cargado) y subirla completa. Sirve para cargar de una vez todo lo
// que midió la nutricionista, también de hace tiempo.
//
// Al subir: primero muestra qué va a pasar (cuántas fechas nuevas y
// cuántas se completan) y recién guarda con "Cargar". Si la planilla
// tiene algo que no se entiende, lista los problemas con su fila y no
// carga nada.
//   mediciones: las del alumno. onCargado: se llama después de guardar.
export default function PlanillaDeMedidas({ clienteId, mediciones, onCargado }) {
  const [ocupado, setOcupado] = useState('')
  const [errores, setErrores] = useState([])
  // Lo leído, esperando la confirmación: { nuevas, cambios, iguales }.
  const [plan, setPlan] = useState(null)

  async function bajar() {
    setOcupado('bajando')
    try {
      const bytes = await crearPlanillaDeMedidas(filasParaPlanilla(mediciones))
      descargarBlob(new Blob([bytes], { type: TIPO_XLSX }), 'DREY - Valoracion antropometrica.xlsx')
    } catch {
      mostrarAviso('No pudimos armar la planilla. Probá de nuevo.', 'error')
    }
    setOcupado('')
  }

  async function subir(event) {
    const archivo = event.target.files?.[0]
    event.target.value = ''
    if (!archivo) return
    setOcupado('leyendo')
    setErrores([])
    setPlan(null)
    try {
      const renglones = await leerPlanillaDeMedidas(await archivo.arrayBuffer())
      const leido = leerPlanilla(renglones, obtenerFechaHoyISO())
      if (leido.errores.length) setErrores(leido.errores)
      else setPlan(planDeCarga(leido.filas, mediciones))
    } catch (error) {
      setErrores([error?.message || 'No pudimos abrir el archivo.'])
    }
    setOcupado('')
  }

  async function cargar() {
    setOcupado('guardando')
    const error = await guardarCargaDeMedidas(clienteId, plan)
    setOcupado('')
    if (error) {
      setErrores([
        error.message?.includes('column')
          ? 'Falta activar la valoración antropométrica en la base de datos (SQL 038 de Supabase).'
          : 'No pudimos guardar la planilla. Probá de nuevo.',
      ])
      return
    }
    setPlan(null)
    mostrarAviso('Valoración cargada ✓')
    onCargado()
  }

  const hayCambios = plan && (plan.nuevas.length > 0 || plan.cambios.length > 0)

  return (
    <details className="planilla-medidas">
      <summary>Valoración antropométrica en Excel</summary>
      <p className="profe-nota">
        Para cargar de una vez lo que mide la nutricionista (también fechas de hace tiempo): bajá
        la planilla, completá una fila por fecha y subila.
      </p>
      <div className="acciones-fila">
        <button type="button" className="boton-secundario" onClick={bajar} disabled={Boolean(ocupado)}>
          {ocupado === 'bajando' ? 'Armando…' : '⬇ Bajar planilla'}
        </button>
        <label
          className={ocupado ? 'boton-secundario boton-deshabilitado' : 'boton-secundario'}
        >
          {ocupado === 'leyendo' ? 'Leyendo…' : '⬆ Subir planilla'}
          <input type="file" accept=".xlsx" hidden disabled={Boolean(ocupado)} onChange={subir} />
        </label>
      </div>

      {errores.length > 0 && (
        <div className="auth-message" role="alert">
          <strong>No se cargó nada. Corregí esto en la planilla y subila de nuevo:</strong>
          <ul className="planilla-medidas-errores">
            {errores.map((texto) => (
              <li key={texto}>{texto}</li>
            ))}
          </ul>
        </div>
      )}

      {plan && (
        <div className="planilla-medidas-plan" role="status">
          <p>{textoDelPlan(plan)}</p>
          {hayCambios && (
            <>
              <p className="profe-nota">
                {[...plan.nuevas, ...plan.cambios]
                  .map((fila) => fila.fecha.split('-').reverse().join('/'))
                  .join(' · ')}
              </p>
              <div className="acciones-fila">
                <button
                  type="button"
                  className="boton-principal"
                  onClick={cargar}
                  disabled={Boolean(ocupado)}
                >
                  {ocupado === 'guardando' ? 'Cargando…' : 'Cargar'}
                </button>
                <button type="button" className="boton-secundario" onClick={() => setPlan(null)}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </details>
  )
}
