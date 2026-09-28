import { useState } from 'react'
import { MAXIMO_SEMANAS } from '../../utils/semanas.js'
import { semanasDeRutinas } from '../../utils/programa.js'

const OPCIONES_SEMANAS = Array.from({ length: MAXIMO_SEMANAS }, (_, indice) => indice + 1)
const OPCIONES_DIAS = [1, 2, 3, 4, 5, 6, 7]
// Si ninguna rutina tiene ciclo, la planilla viene con 4 semanas (como la
// planilla de siempre del profe). Si no cambia nada de semana a semana,
// al subirla la rutina queda sin ciclo.
const SEMANAS_POR_DEFECTO = 4

// Paso 1 de "Rutinas en Excel": elegir qué va en la planilla y bajarla.
//   · Con sus rutinas: las del cliente que se tilden (todas de entrada).
//   · Vacía: para armar desde cero, con la cantidad de días y semanas.
// onDescargar({ rutinaIds, semanas, dias }) arma y baja el archivo.
export default function DescargarPlanilla({ actuales, descargando, onDescargar }) {
  const tieneRutinas = actuales.length > 0
  const [modo, setModo] = useState(tieneRutinas ? 'rutinas' : 'vacia')
  const [elegidas, setElegidas] = useState(() => actuales.map(({ rutina }) => rutina.id))
  const [semanas, setSemanas] = useState(() => semanasDeRutinas(actuales, SEMANAS_POR_DEFECTO))
  const [dias, setDias] = useState(3)

  function alternar(id) {
    setElegidas((actual) =>
      actual.includes(id) ? actual.filter((otro) => otro !== id) : [...actual, id],
    )
  }

  const conRutinas = modo === 'rutinas'
  const puede = !descargando && (!conRutinas || elegidas.length > 0)

  return (
    <section className="seccion-rutina planilla-paso">
      <p className="planilla-paso-titulo">1. Descargar la planilla</p>
      {tieneRutinas && (
        <div className="chips-lista">
          <button
            type="button"
            className={conRutinas ? 'chip chip-activo' : 'chip'}
            aria-pressed={conRutinas}
            onClick={() => setModo('rutinas')}
          >
            Con sus rutinas
          </button>
          <button
            type="button"
            className={conRutinas ? 'chip' : 'chip chip-activo'}
            aria-pressed={!conRutinas}
            onClick={() => setModo('vacia')}
          >
            Vacía, para armar de cero
          </button>
        </div>
      )}

      {conRutinas ? (
        <fieldset className="planilla-rutinas">
          <legend className="editor-rango-etiqueta">Rutinas que van en la planilla</legend>
          {actuales.map(({ rutina, ejercicios }) => (
            <label key={rutina.id} className="planilla-rutina">
              <input
                type="checkbox"
                checked={elegidas.includes(rutina.id)}
                onChange={() => alternar(rutina.id)}
              />
              <span>
                <strong>{rutina.nombre}</strong>
                <small>
                  {ejercicios.length === 1 ? '1 ejercicio' : `${ejercicios.length} ejercicios`}
                  {rutina.ciclo_semanas ? ` · ciclo de ${rutina.ciclo_semanas} semanas` : ''}
                  {rutina.publicada === false ? ' · borrador' : ''}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <label className="editor-campo">
          <span>Días de entrenamiento</span>
          <select
            className="profe-calendario-select"
            value={dias}
            onChange={(event) => setDias(Number(event.target.value))}
          >
            {OPCIONES_DIAS.map((opcion) => (
              <option key={opcion} value={opcion}>
                {opcion === 1 ? '1 día' : `${opcion} días`}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="editor-campo">
        <span>Semanas del plan</span>
        <select
          className="profe-calendario-select"
          value={semanas}
          onChange={(event) => setSemanas(Number(event.target.value))}
        >
          {OPCIONES_SEMANAS.map((opcion) => (
            <option key={opcion} value={opcion}>
              {opcion === 1 ? '1 semana (sin ciclo)' : `${opcion} semanas`}
            </option>
          ))}
        </select>
      </label>
      <p className="profe-nota planilla-nota">
        Cada semana tiene sus series, repeticiones y peso. Si no cambia nada de una semana a otra,
        la rutina queda sin ciclo.
      </p>

      <button
        type="button"
        className="boton-principal"
        disabled={!puede}
        onClick={() =>
          onDescargar({
            rutinaIds: conRutinas ? elegidas : [],
            semanas,
            dias: conRutinas ? 0 : dias,
          })
        }
      >
        {descargando ? 'Armando la planilla…' : '⬇ Descargar planilla (.xlsx)'}
      </button>
      <p className="profe-nota planilla-nota">
        Se abre con Excel, Google Sheets (Archivo → Importar) o LibreOffice.
      </p>
    </section>
  )
}
