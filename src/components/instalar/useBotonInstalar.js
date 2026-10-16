import { useState } from 'react'
import { mostrarAviso } from '../../services/avisos.js'
import { instalarConUnToque, useInstalacion } from '../../services/instalacion.js'

// Lo que hace cualquier botón "Instalar DREY" (tarjeta del Inicio y
// opción de Perfil / Mi cuenta):
//   · si el navegador la instala con un toque (Android con Chrome, compu),
//     abre directamente su ventanita;
//   · si no (iPhone, otros navegadores), abre la guía con los pasos.
//
// Devuelve { info, instalar, guiaAbierta, cerrarGuia }: "info" es el
// estado de services/instalacion.js; "guiaAbierta" y "cerrarGuia" van a
// <GuiaInstalacion />.
export function useBotonInstalar() {
  const info = useInstalacion()
  const [guiaAbierta, setGuiaAbierta] = useState(false)

  async function instalar() {
    if (info.estado !== 'un-toque') {
      setGuiaAbierta(true)
      return
    }
    const resultado = await instalarConUnToque()
    if (resultado === 'instalada') mostrarAviso('¡Listo! DREY quedó instalada')
    // Si el navegador ya no la ofrece, los pasos a mano.
    if (resultado === 'sin-pedido') setGuiaAbierta(true)
  }

  return { info, instalar, guiaAbierta, cerrarGuia: () => setGuiaAbierta(false) }
}
