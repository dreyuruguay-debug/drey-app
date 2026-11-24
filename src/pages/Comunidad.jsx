import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { linkGrupoWhatsapp } from '../data/comunidad.js'
import { useConfiguracion } from '../services/configuracion.js'
import { cargarCodigosDeRopa } from '../services/codigos.js'
import { cargarMensajesDeHoy } from '../services/mensajesProfe.js'
import { mensajesParaMostrar } from '../utils/mensajesDelDia.js'
import { obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'

// Comunidad y beneficios: las novedades de su profe, los códigos de
// descuento de la marca de ropa DREY y el acceso al grupo de WhatsApp
// de la comunidad (no hay chat dentro de la app).
//
// Las novedades son los mensajes que el profe escribió para hoy
// (pages/ProfeMensajes.jsx, supabase/sql/037): los mismos que el alumno
// ve en grande al abrir la app (components/MensajeDelDia.jsx), acá a mano
// para volver a leerlos. En las fiestas, si el profe no escribió nada,
// aparece el saludo de la fiesta.
//
// Los códigos de ropa son reales: los crea el profe en Pagos → Códigos
// de descuento → "De ropa" (solo los ven los clientes con el plan al
// día). El link del grupo de WhatsApp lo carga el Admin en Ajustes →
// WhatsApp (solo lo ven los alumnos al día, supabase/sql/039).

export default function Comunidad() {
  useConfiguracion() // el link del grupo lo carga el Admin en Ajustes
  const whatsappGrupoUrl = linkGrupoWhatsapp()
  const [novedades, setNovedades] = useState(null) // null = cargando
  const [codigos, setCodigos] = useState([])

  useEffect(() => {
    let vigente = true
    cargarCodigosDeRopa().then((lista) => {
      if (vigente) setCodigos(lista)
    })
    cargarMensajesDeHoy().then((datos) => {
      if (!vigente) return
      setNovedades(datos ? mensajesParaMostrar(datos, obtenerFechaHoyISO()) : [])
    })
    return () => {
      vigente = false
    }
  }, [])

  return (
    <div className="screen has-bottom-nav">
      <TopPattern />
      <div className="comunidad-contenido">
        <Link to="/perfil" className="volver-enlace">
          ← Perfil
        </Link>
        <h1 className="comunidad-titulo">Comunidad y beneficios</h1>

        {whatsappGrupoUrl ? (
          <a
            className="pill-button comunidad-whatsapp"
            href={whatsappGrupoUrl}
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

        <p className="comunidad-seccion-label">Novedades de tu profe</p>
        {novedades === null ? null : novedades.length === 0 ? (
          <p className="comunidad-vacio">Cuando tu profe publique novedades, las vas a ver acá.</p>
        ) : (
          novedades.map((novedad) => (
            <div key={novedad.id} className="comunidad-post">
              <p className="comunidad-post-texto">{novedad.texto}</p>
              <p className="comunidad-novedad-firma">{novedad.firma}</p>
            </div>
          ))
        )}

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
