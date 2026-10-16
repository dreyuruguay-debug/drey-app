import GuiaInstalacion from './GuiaInstalacion.jsx'
import { useBotonInstalar } from './useBotonInstalar.js'

// Opción fija "Instalar DREY" en la lista de Perfil (alumno) y de Mi
// cuenta (profe), para quien tocó "Ahora no" en el Inicio o la busca
// después. Tiene el mismo aspecto que las demás opciones de la lista.
//
// No aparece si DREY ya se está usando como app, ni en una compu cuyo
// navegador no permite instalarla.
export default function OpcionInstalar() {
  const { info, instalar, guiaAbierta, cerrarGuia } = useBotonInstalar()

  if (info.estado === 'instalada' || info.estado === 'no-aplica') return null

  const [titulo, detalle] =
    info.estado === 'instalada-aparte'
      ? ['DREY ya está instalada', 'Abrila desde su ícono. Tocá acá si no la encontrás.']
      : [
          `Instalar DREY en ${info.dispositivo === 'compu' ? 'esta compu' : 'este celular'}`,
          'Se abre como una app, desde su ícono, y te llegan los avisos.',
        ]

  return (
    <>
      <button type="button" className="tarjeta-rutina instalar-opcion" onClick={instalar}>
        <span className="tarjeta-rutina-textos">
          <strong>{titulo}</strong>
          <small>{detalle}</small>
        </span>
        <span className="tarjeta-flecha" aria-hidden="true">
          ›
        </span>
      </button>
      <GuiaInstalacion abierta={guiaAbierta} onCerrar={cerrarGuia} />
    </>
  )
}
