import { useNavigate } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'
import { POLITICA_PRIVACIDAD, TERMINOS_Y_CONDICIONES } from '../data/legal.js'
import { TEXTOS_REVISADOS, VERSION_TERMINOS } from '../data/versionLegal.js'
import { textoFechaCorta } from '../utils/dias.js'

const TEXTOS = { privacidad: POLITICA_PRIVACIDAD, terminos: TERMINOS_Y_CONDICIONES }

// Página pública (se ve sin iniciar sesión) con los términos y
// condiciones o la política de privacidad. Los textos están en
// src/data/legal.js.
export default function Legal({ tipo }) {
  const navigate = useNavigate()
  const texto = TEXTOS[tipo]

  function volver() {
    // Si se abrió en una pestaña nueva (desde el registro), no hay a
    // dónde volver: se cierra o se va al comienzo.
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="screen pagina-cliente legal">
      <TopPattern />
      <button type="button" className="volver-enlace boton-texto-plano" onClick={volver}>
        ← Volver
      </button>
      <h1 className="pagina-titulo">{texto.titulo}</h1>
      <p className="legal-version">Versión del {textoFechaCorta(VERSION_TERMINOS)}</p>
      {!TEXTOS_REVISADOS && (
        <p className="legal-borrador">Texto en revisión: puede tener cambios antes del lanzamiento.</p>
      )}
      {texto.secciones.map((seccion) => (
        <section key={seccion.titulo} className="legal-seccion">
          <h2>{seccion.titulo}</h2>
          {seccion.parrafos.map((parrafo) => (
            <p key={parrafo.slice(0, 40)}>{parrafo}</p>
          ))}
        </section>
      ))}
    </div>
  )
}
