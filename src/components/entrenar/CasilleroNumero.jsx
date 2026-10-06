import { useState } from 'react'
import { leerValorEscrito } from '../../utils/entrenamiento.js'

// Casillero para escribir un peso o unas repeticiones tocando el número.
// Lo usan el modo entrenar (entre los botones − y +) y la corrección de
// un entrenamiento ya guardado (components/EditorEntrenamiento.jsx).
//
// Se guarda al salir del casillero o con "Listo" / Enter; si lo escrito
// no se entiende (o se pasa del máximo), vuelve al valor de antes.
//   valor: lo que se muestra (por ejemplo "22,5" o 8).
//   campo: 'kg' (admite decimales) o 'reps' (enteras).
//   onFijar(numero): se llama con el número ya leído.
//   etiqueta: para los lectores de pantalla ("kilos", "repeticiones").
//   enVivo: avisa cada número válido mientras se escribe, sin esperar a
//     salir del casillero (así "Guardar corrección" se habilita enseguida).
export default function CasilleroNumero({
  valor,
  campo,
  etiqueta,
  onFijar,
  className = 'entrenar-stepper-input',
  enVivo = false,
}) {
  // null = no se está escribiendo (se muestra el valor recibido).
  const [texto, setTexto] = useState(null)

  function confirmar() {
    if (texto === null) return
    const numero = leerValorEscrito(texto, campo)
    if (numero !== null) onFijar(numero)
    setTexto(null)
  }

  return (
    <input
      className={className}
      type="text"
      inputMode={campo === 'kg' ? 'decimal' : 'numeric'}
      enterKeyHint="done"
      autoComplete="off"
      value={texto ?? String(valor)}
      onFocus={(event) => {
        setTexto(String(valor))
        event.target.select()
      }}
      onChange={(event) => {
        setTexto(event.target.value)
        if (!enVivo) return
        const numero = leerValorEscrito(event.target.value, campo)
        if (numero !== null) onFijar(numero)
      }}
      onBlur={confirmar}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      aria-label={`${etiqueta}: tocá para escribirlo`}
    />
  )
}
