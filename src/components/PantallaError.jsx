import { Component } from 'react'
import { reportarError } from '../services/errores.js'

// Si una pantalla se rompe, en vez de quedar todo en blanco se muestra
// este mensaje con un botón para volver a cargar. El error se avisa por
// mail (ver services/errores.js).
//
// Los entrenamientos a medias están guardados en el celular, así que al
// volver a cargar el alumno sigue donde estaba.
export default class PantallaError extends Component {
  constructor(props) {
    super(props)
    this.state = { hayError: false }
  }

  static getDerivedStateFromError() {
    return { hayError: true }
  }

  componentDidCatch(error, info) {
    reportarError(error, { donde: 'pantalla', componentes: info?.componentStack?.slice(0, 800) })
  }

  render() {
    if (!this.state.hayError) return this.props.children
    return (
      <main className="auth-screen pantalla-error">
        <img src="/drey-logo.png" alt="DREY" className="auth-logo-img" />
        <p className="registro-gracias-titulo">Algo salió mal</p>
        <p className="registro-gracias-texto">
          Ya nos llegó el aviso. Tocá el botón para volver a cargar; si estabas entrenando, seguís
          donde estabas.
        </p>
        <button
          type="button"
          className="boton-principal"
          onClick={() => window.location.reload()}
        >
          Volver a cargar
        </button>
        <a href="/" className="auth-switch">
          Ir al comienzo
        </a>
      </main>
    )
  }
}
