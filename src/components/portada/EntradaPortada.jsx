import { useState } from 'react'
import { Link } from 'react-router-dom'

// Los botones de la página de inicio (pages/Portada.jsx), arriba sobre el
// video y abajo en el cierre. Dos formas:
//
//   · Sin sesión: "Iniciar sesión" y "Registrarme". "Iniciar sesión" abre
//     la hoja que sube desde abajo con el email y la contraseña
//     (components/portada/HojaIngreso.jsx, la maneja la portada).
//   · Con la sesión abierta (alguien que le muestra DREY a un amigo desde
//     Perfil → "Mostrar DREY a un amigo"): "Volver a mi cuenta" y
//     "Compartir DREY" (manda el link por WhatsApp, Instagram... o lo
//     copia).
//
//   onIniciarSesion: abre la hoja para iniciar sesión.
//   miCuenta: adónde vuelve quien tiene la sesión abierta ('/inicio' o
//     '/profe'), o null si no tiene.
//   registrarsePrimero: en el cierre, "Registrarme" va primero.
export default function EntradaPortada({
  onIniciarSesion,
  miCuenta = null,
  registrarsePrimero = false,
}) {
  if (miCuenta) return <BotonesConSesion miCuenta={miCuenta} />

  const entrar = (
    <button
      key="entrar"
      type="button"
      className={
        registrarsePrimero
          ? 'portada-boton portada-boton-borde'
          : 'portada-boton portada-boton-lleno'
      }
      aria-haspopup="dialog"
      onClick={onIniciarSesion}
    >
      Iniciar sesión
    </button>
  )
  const registrarse = (
    <Link
      key="registrarse"
      to="/registro"
      className={
        registrarsePrimero
          ? 'portada-boton portada-boton-lleno'
          : 'portada-boton portada-boton-borde'
      }
    >
      Registrarme
    </Link>
  )
  return (
    <div className="portada-botones">
      {registrarsePrimero ? [registrarse, entrar] : [entrar, registrarse]}
    </div>
  )
}

const TEXTO_COMPARTIR = 'Mirá DREY: entrenás con un profe que te arma la rutina y te sigue de verdad.'
const DURACION_AVISO_MS = 2500

function BotonesConSesion({ miCuenta }) {
  const [aviso, setAviso] = useState('')

  async function compartir() {
    const url = window.location.origin
    try {
      if (navigator.share) {
        await navigator.share({ title: 'DREY', text: TEXTO_COMPARTIR, url })
        return
      }
      await navigator.clipboard.writeText(`${TEXTO_COMPARTIR} ${url}`)
      mostrarAviso('¡Link copiado! Pegalo donde quieras.')
    } catch (error) {
      // Cerró la ventana de compartir sin elegir: no es un error.
      if (error?.name === 'AbortError') return
      mostrarAviso(`Copiá este link: ${url}`)
    }
  }

  function mostrarAviso(texto) {
    setAviso(texto)
    setTimeout(() => setAviso((actual) => (actual === texto ? '' : actual)), DURACION_AVISO_MS)
  }

  return (
    <div className="portada-entrada">
      <div className="portada-botones">
        <Link to={miCuenta} className="portada-boton portada-boton-lleno">
          Volver a mi cuenta
        </Link>
        <button type="button" className="portada-boton portada-boton-borde" onClick={compartir}>
          Compartir DREY
        </button>
      </div>
      <p className="portada-entrada-aviso" role="status">
        {aviso}
      </p>
    </div>
  )
}
