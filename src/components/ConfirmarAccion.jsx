import { useCallback, useState } from 'react'
import HojaInferior from './HojaInferior.jsx'

// Pedir confirmación antes de algo que no se puede deshacer (borrar,
// descartar, dar de baja...). Reemplaza la ventanita del navegador
// ("dreysport.com.uy dice" / Aceptar): usa la hoja de abajo de DREY
// (HojaInferior.jsx) con un título, qué va a pasar y dos botones que
// dicen lo que hacen.
//
// Uso en una pantalla:
//   const [confirmar, hojaConfirmar] = useConfirmar()
//   ...
//   const seguro = await confirmar({
//     titulo: '¿Borrar la rutina?',
//     texto: 'Se borra y no se puede deshacer.',
//     confirmar: 'Sí, borrar',
//     cancelar: 'No, dejarla',  // opcional (por defecto "Cancelar")
//     peligro: false,           // opcional: botón verde en vez de rojo
//   })
//   if (!seguro) return
//   ...
//   return (<>...{hojaConfirmar}</>)
//
// confirmar() devuelve una promesa: true si tocó el botón de confirmar;
// false si tocó cancelar, la ✕, lo oscuro de atrás o Escape.
export function useConfirmar() {
  const [pedido, setPedido] = useState(null)

  const confirmar = useCallback(
    (opciones) =>
      new Promise((resolver) => {
        setPedido({ ...opciones, resolver })
      }),
    [],
  )

  function responder(respuesta) {
    pedido?.resolver(respuesta)
    setPedido(null)
  }

  const hoja = (
    <HojaInferior
      abierta={Boolean(pedido)}
      onCerrar={() => responder(false)}
      titulo={pedido?.titulo}
      id="confirmar-accion"
    >
      {pedido && (
        <>
          {pedido.texto && <p className="confirmar-texto">{pedido.texto}</p>}
          <div className="confirmar-botones">
            <button
              type="button"
              className={pedido.peligro === false ? 'boton-principal' : 'boton-peligro'}
              onClick={() => responder(true)}
            >
              {pedido.confirmar}
            </button>
            <button type="button" className="boton-secundario" onClick={() => responder(false)}>
              {pedido.cancelar || 'Cancelar'}
            </button>
          </div>
        </>
      )}
    </HojaInferior>
  )

  return [confirmar, hoja]
}
