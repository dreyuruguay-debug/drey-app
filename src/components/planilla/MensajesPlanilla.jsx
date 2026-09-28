import { useState } from 'react'

const MOSTRAR_DE_ENTRADA = 8

// Lista de errores o advertencias de la planilla, cada uno con dónde está
// (hoja y celda, como en Excel: "Ejercicios · F18") y qué pasa.
// tipo: 'error' (impide importar) o 'aviso' (se puede importar igual).
export default function MensajesPlanilla({ tipo, mensajes }) {
  const [todos, setTodos] = useState(false)
  if (!mensajes.length) return null
  const esError = tipo === 'error'
  const visibles = todos ? mensajes : mensajes.slice(0, MOSTRAR_DE_ENTRADA)
  const titulo = esError
    ? `${mensajes.length === 1 ? 'Un problema' : `${mensajes.length} problemas`} para corregir`
    : `${mensajes.length === 1 ? 'Un aviso' : `${mensajes.length} avisos`} (se puede importar igual)`

  return (
    <div
      className={
        esError ? 'planilla-mensajes planilla-errores' : 'planilla-mensajes planilla-avisos'
      }
      role={esError ? 'alert' : undefined}
    >
      <p className="planilla-mensajes-titulo">
        {esError ? '✕' : '!'} {titulo}
      </p>
      <ul>
        {visibles.map((mensaje, indice) => (
          <li key={`${mensaje.celda}-${indice}`}>
            {mensaje.celda && (
              <span className="planilla-celda">{mensaje.celda.replace('!', ' · ')}</span>
            )}
            <span>{mensaje.texto}</span>
          </li>
        ))}
      </ul>
      {mensajes.length > MOSTRAR_DE_ENTRADA && (
        <button type="button" className="profe-ejercicio-agregar" onClick={() => setTodos(!todos)}>
          {todos ? 'Ver menos' : `Ver los ${mensajes.length}`}
        </button>
      )}
    </div>
  )
}
