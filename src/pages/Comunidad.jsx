import { useState } from 'react'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { WHATSAPP_GRUPO_URL } from '../data/comunidad.js'

// Comunidad y beneficios: muro de novedades del profe, códigos de
// descuento de la marca de ropa DREY y el acceso al grupo de WhatsApp
// de la comunidad (no hay chat dentro de la app).
//
// Las publicaciones y los códigos son de ejemplo por ahora: van a venir
// de lo que cargue el profe desde su panel, todavía no construido. Los
// comentarios que se escriban acá tampoco se guardan todavía. El link
// del grupo de WhatsApp se carga en src/data/comunidad.js.
const PUBLICACIONES_EJEMPLO = [
  {
    id: 1,
    autor: 'Profe',
    fecha: '15 de septiembre',
    texto: 'Este sábado hay clase grupal al aire libre a las 9hs. ¡Los espero!',
  },
  {
    id: 2,
    autor: 'Profe',
    fecha: '10 de septiembre',
    texto: 'Nueva tanda de remeras DREY disponible. Los clientes activos tienen descuento.',
  },
]

const CODIGOS_EJEMPLO = [{ codigo: 'DREY10', descripcion: '10% off en toda la ropa DREY' }]

export default function Comunidad() {
  const [comentarios, setComentarios] = useState({})
  const [textoNuevo, setTextoNuevo] = useState({})

  function handleComentar(event, publicacionId) {
    event.preventDefault()
    const texto = (textoNuevo[publicacionId] || '').trim()
    if (!texto) return
    setComentarios((actual) => ({
      ...actual,
      [publicacionId]: [...(actual[publicacionId] || []), texto],
    }))
    setTextoNuevo((actual) => ({ ...actual, [publicacionId]: '' }))
  }

  return (
    <div className="screen has-bottom-nav">
      <TopPattern />
      <div className="comunidad-contenido">
        <h1 className="comunidad-titulo">Comunidad y beneficios</h1>

        {WHATSAPP_GRUPO_URL ? (
          <a
            className="pill-button comunidad-whatsapp"
            href={WHATSAPP_GRUPO_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Unirme al grupo de WhatsApp
          </a>
        ) : (
          <button type="button" className="pill-button suscripcion-boton-desactivado" disabled>
            Grupo de WhatsApp: link disponible próximamente
          </button>
        )}

        <p className="comunidad-seccion-label">Muro</p>
        {PUBLICACIONES_EJEMPLO.map((publicacion) => (
          <div key={publicacion.id} className="comunidad-post">
            <div className="comunidad-post-header">
              <span className="comunidad-post-autor">{publicacion.autor}</span>
              <span className="comunidad-post-fecha">{publicacion.fecha}</span>
            </div>
            <p className="comunidad-post-texto">{publicacion.texto}</p>

            {(comentarios[publicacion.id] || []).map((comentario, index) => (
              <p key={index} className="comunidad-comentario">
                {comentario}
              </p>
            ))}

            <form
              className="comunidad-comentar-form"
              onSubmit={(event) => handleComentar(event, publicacion.id)}
            >
              <input
                className="comunidad-comentar-input"
                type="text"
                placeholder="Escribir un comentario…"
                value={textoNuevo[publicacion.id] || ''}
                onChange={(event) =>
                  setTextoNuevo((actual) => ({
                    ...actual,
                    [publicacion.id]: event.target.value,
                  }))
                }
              />
              <button type="submit" className="comunidad-comentar-boton">
                Enviar
              </button>
            </form>
          </div>
        ))}

        <p className="comunidad-seccion-label">Beneficios</p>
        <div className="comunidad-codigos">
          {CODIGOS_EJEMPLO.map((item) => (
            <div key={item.codigo} className="comunidad-codigo-card">
              <span className="comunidad-codigo-valor">{item.codigo}</span>
              <span className="comunidad-codigo-descripcion">{item.descripcion}</span>
            </div>
          ))}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
