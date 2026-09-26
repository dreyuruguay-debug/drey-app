import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { WHATSAPP_GRUPO_URL } from '../data/comunidad.js'
import { cargarCodigosDeRopa } from '../services/codigos.js'
import { textoFechaCorta } from '../utils/dias.js'

// Comunidad y beneficios: muro de novedades del profe, códigos de
// descuento de la marca de ropa DREY y el acceso al grupo de WhatsApp
// de la comunidad (no hay chat dentro de la app).
//
// Los códigos de ropa son reales: los crea el profe en Pagos → Códigos
// de descuento → "De ropa" (solo los ven los clientes con el plan al
// día). Las publicaciones del muro son de ejemplo por ahora y los
// comentarios todavía no se guardan. El link del grupo de WhatsApp se
// carga en src/data/comunidad.js.
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

export default function Comunidad() {
  const [comentarios, setComentarios] = useState({})
  const [textoNuevo, setTextoNuevo] = useState({})
  const [codigos, setCodigos] = useState([])

  useEffect(() => {
    cargarCodigosDeRopa().then(setCodigos)
  }, [])

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
        <Link to="/perfil" className="volver-enlace">
          ← Perfil
        </Link>
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
          {codigos.length === 0 ? (
            <p className="comunidad-codigo-descripcion">
              Pronto vas a ver acá los descuentos en la ropa DREY.
            </p>
          ) : (
            codigos.map((item) => (
              <div key={item.id} className="comunidad-codigo-card">
                <span className="comunidad-codigo-valor">{item.codigo}</span>
                <span className="comunidad-codigo-descripcion">
                  {item.descripcion}
                  {item.vence ? ` · hasta el ${textoFechaCorta(item.vence)}` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  )
}
