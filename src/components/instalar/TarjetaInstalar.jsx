import { noOfrecerPorAhora } from '../../services/instalacion.js'
import GuiaInstalacion from './GuiaInstalacion.jsx'
import { useBotonInstalar } from './useBotonInstalar.js'
import { IconoDrey } from './Dibujos.jsx'

// Tarjeta "Instalá DREY en tu celular" del Inicio del alumno (pages/Home.jsx).
// Aparece en el celular mientras DREY no esté instalada. "Ahora no" la
// esconde por 14 días en ese celular (services/instalacion.js); igual
// queda la opción fija en Perfil (OpcionInstalar.jsx).
//
// Home decide si se muestra (useInstalacion().ofrecerEnInicio), así la
// invitación a activar los avisos no aparece al mismo tiempo.
export default function TarjetaInstalar() {
  const { info, instalar, guiaAbierta, cerrarGuia } = useBotonInstalar()
  const enIphone = info.estado === 'ios-safari' || info.estado === 'ios-otro'

  return (
    <>
      <div className="instalar-tarjeta">
        <div className="instalar-tarjeta-cabecera">
          <IconoDrey />
          <p>
            <strong>Instalá DREY en tu celular</strong>
            Se abre desde su ícono, en pantalla completa, y te llegan los avisos de tus
            entrenamientos.
            {enIphone && ' En iPhone, los avisos solo llegan con DREY instalada.'}
          </p>
        </div>
        <div className="instalar-tarjeta-botones">
          <button type="button" className="boton-secundario boton-chico" onClick={instalar}>
            Instalar DREY
          </button>
          <button type="button" className="boton-texto" onClick={noOfrecerPorAhora}>
            Ahora no
          </button>
        </div>
      </div>
      <GuiaInstalacion abierta={guiaAbierta} onCerrar={cerrarGuia} />
    </>
  )
}
