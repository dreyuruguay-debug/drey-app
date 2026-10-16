import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import HojaInferior from '../HojaInferior.jsx'
import FormularioIngreso from '../FormularioIngreso.jsx'

// "Iniciar sesión" de la página de inicio (pages/Portada.jsx): una hoja
// que sube desde abajo, encima del video, con el email y la contraseña
// (components/FormularioIngreso.jsx). El video y los botones quedan a la
// vista, apenas oscurecidos detrás.
//
// La hoja en sí (cerrar con ✕, Escape o tocando atrás; en la compu,
// centrada) es components/HojaInferior.jsx. Lo propio de esta: al abrirse
// pone el cursor en el email (en el celular abre el teclado, porque la
// persona acaba de tocar "Iniciar sesión") y, cuando aparece el teclado,
// la hoja sube con él para que "Entrar" siga a la vista
// (useAlturaDelTeclado).
//
//   abierta: si se ve. onCerrar: la cierra.
export default function HojaIngreso({ abierta, onCerrar }) {
  const navigate = useNavigate()
  const teclado = useAlturaDelTeclado(abierta)

  return (
    <HojaInferior
      abierta={abierta}
      onCerrar={onCerrar}
      titulo="Iniciar sesión"
      id="hoja-ingreso"
      enfocarCampo
      estilo={{ '--hoja-teclado': `${teclado}px` }}
    >
      <FormularioIngreso onRegistrarme={() => navigate('/registro')} />
    </HojaInferior>
  )
}

// Cuánto tapa el teclado del celular (en px), para subir la hoja por
// encima. Usa visualViewport (lo que se ve de la página): si es más bajo
// que la ventana, la diferencia es el teclado. Sin visualViewport, 0.
function useAlturaDelTeclado(activo) {
  const [alto, setAlto] = useState(0)
  useEffect(() => {
    const vista = window.visualViewport
    if (!activo || !vista) return undefined
    function medir() {
      setAlto(Math.max(0, Math.round(window.innerHeight - vista.height - vista.offsetTop)))
    }
    medir()
    vista.addEventListener('resize', medir)
    vista.addEventListener('scroll', medir)
    return () => {
      vista.removeEventListener('resize', medir)
      vista.removeEventListener('scroll', medir)
      setAlto(0)
    }
  }, [activo])
  return alto
}
