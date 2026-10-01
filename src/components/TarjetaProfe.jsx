import { useState } from 'react'
import {
  iniciales,
  linkInstagram,
  textoExperiencia,
  textoModalidades,
} from '../data/especialidades.js'

// Tarjeta con el perfil público de un profe: foto (o sus iniciales),
// nombre, gimnasio, especialidades, modalidad, experiencia y descripción.
// La ven los alumnos al elegir profe y el propio profe ("Así te ven").
//
// profe: una fila de profes_disponibles() (supabase/sql/026).
// etiqueta: texto opcional arriba a la derecha ("Tu profe").
// children: botones de abajo (pedir, cancelar...).
// La descripción larga se corta y se abre con "Ver más".
const LARGO_RESUMEN = 160

export default function TarjetaProfe({ profe, etiqueta, children }) {
  const [abierta, setAbierta] = useState(false)
  const descripcion = profe.descripcion?.trim() || ''
  const larga = descripcion.length > LARGO_RESUMEN
  const textoDescripcion =
    larga && !abierta ? `${descripcion.slice(0, LARGO_RESUMEN).trimEnd()}…` : descripcion
  const datos = [textoModalidades(profe.modalidades), textoExperiencia(profe.experiencia_anios)]
    .filter(Boolean)
    .join(' · ')
  const instagram = linkInstagram(profe.instagram)

  return (
    <article className="tarjeta-profe">
      <div className="tarjeta-profe-cabecera">
        {profe.foto_url ? (
          <img className="tarjeta-profe-foto" src={profe.foto_url} alt="" loading="lazy" />
        ) : (
          <span className="tarjeta-profe-foto tarjeta-profe-iniciales" aria-hidden="true">
            {iniciales(profe.nombre)}
          </span>
        )}
        <div className="tarjeta-profe-titulo">
          <h3>{profe.nombre || 'Profe'}</h3>
          {profe.gimnasio && <p>{profe.gimnasio}</p>}
          {datos && <p>{datos}</p>}
        </div>
        {etiqueta && (
          <span className="estado-chip estado-ok tarjeta-profe-etiqueta">{etiqueta}</span>
        )}
      </div>

      {profe.especialidades?.length > 0 && (
        <ul className="tarjeta-profe-especialidades" aria-label="Especialidades">
          {profe.especialidades.map((especialidad) => (
            <li key={especialidad} className="chip chip-dato chip-chico">
              {especialidad}
            </li>
          ))}
        </ul>
      )}

      {descripcion && (
        <p className="tarjeta-profe-descripcion">
          {textoDescripcion}
          {larga && (
            <button
              type="button"
              className="boton-texto tarjeta-profe-mas"
              onClick={() => setAbierta((actual) => !actual)}
            >
              {abierta ? 'Ver menos' : 'Ver más'}
            </button>
          )}
        </p>
      )}

      {instagram && (
        <a className="tarjeta-profe-instagram" href={instagram} target="_blank" rel="noreferrer">
          Instagram ↗
        </a>
      )}

      {profe.acepta_alumnos === false && (
        <p className="tarjeta-profe-completo">Por ahora no toma alumnos nuevos.</p>
      )}

      {children && <div className="tarjeta-profe-acciones">{children}</div>}
    </article>
  )
}
