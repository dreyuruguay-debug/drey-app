import { useCallback, useRef } from 'react'

// Para pantallas que cargan datos según la dirección (por ejemplo, la
// ficha de un cliente: /profe/clientes/:id). Si el profe pasa a otro
// cliente antes de que termine de cargar el anterior, la respuesta vieja
// no tiene que pisar la nueva.
//
//   const sigueVigente = useVigente(id)
//   const pedido = id
//   const datos = await cargar(pedido)
//   if (!sigueVigente(pedido)) return  // ya se está mirando otro
export function useVigente(valor) {
  const actual = useRef(valor)
  actual.current = valor
  return useCallback((pedido) => actual.current === pedido, [])
}
