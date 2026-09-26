import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TopPattern from '../components/TopPattern.jsx'
import BottomNav from '../components/BottomNav.jsx'
import { supabase } from '../services/supabaseClient.js'
import { obtenerUsuarioActual } from '../services/sesion.js'
import { descargarMisDatos, solicitarBaja } from '../services/privacidad.js'
import { mostrarAviso } from '../services/avisos.js'
import { textoFechaCorta } from '../utils/dias.js'

// "Privacidad y mis datos" (se entra desde Perfil). Los derechos que da
// la Ley 18.331, en botones:
//   · Ver los términos y la política de privacidad.
//   · Descargar todos sus datos (derecho de acceso).
//   · Corregirlos (lleva a "Mis datos").
//   · Pedir la baja de la cuenta (el profe lo ve como tarea).
export default function PrivacidadYDatos() {
  const navigate = useNavigate()
  const [usuario, setUsuario] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [descargando, setDescargando] = useState(false)
  const [confirmandoBaja, setConfirmandoBaja] = useState(false)
  const [enviandoBaja, setEnviandoBaja] = useState(false)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const actual = await obtenerUsuarioActual()
    if (!actual) {
      navigate('/')
      return
    }
    setUsuario(actual)
    const { data } = await supabase
      .from('perfiles')
      .select('terminos_version, terminos_aceptados_en, consentimiento_salud_en, baja_solicitada_en')
      .eq('id', actual.id)
      .single()
    setPerfil(data || null)
  }

  async function descargar() {
    setDescargando(true)
    const error = await descargarMisDatos(usuario)
    setDescargando(false)
    mostrarAviso(error ? 'No pudimos armar el archivo. Probá con señal.' : 'Descargado', error ? 'error' : 'ok')
  }

  async function pedirBaja() {
    setEnviandoBaja(true)
    const error = await solicitarBaja()
    setEnviandoBaja(false)
    setConfirmandoBaja(false)
    if (error) {
      mostrarAviso('No pudimos enviar el pedido. Probá de nuevo.', 'error')
      return
    }
    mostrarAviso('Pedido de baja enviado')
    cargar()
  }

  return (
    <div className="screen has-bottom-nav pagina-cliente">
      <TopPattern />
      <Link to="/perfil" className="volver-enlace">
        ← Perfil
      </Link>
      <h1 className="pagina-titulo">Privacidad y mis datos</h1>

      <nav className="lista-tarjetas" aria-label="Textos legales">
        <Link to="/privacidad" className="tarjeta-rutina">
          <span className="tarjeta-rutina-textos">
            <strong>Política de privacidad</strong>
            <small>Qué datos guardamos, para qué y tus derechos</small>
          </span>
          <span className="tarjeta-flecha" aria-hidden="true">
            ›
          </span>
        </Link>
        <Link to="/terminos" className="tarjeta-rutina">
          <span className="tarjeta-rutina-textos">
            <strong>Términos y condiciones</strong>
            <small>Planes, pagos, salud y uso de la app</small>
          </span>
          <span className="tarjeta-flecha" aria-hidden="true">
            ›
          </span>
        </Link>
      </nav>

      {perfil?.terminos_aceptados_en && (
        <p className="profe-nota">
          Aceptaste la versión del {textoFechaCorta(perfil.terminos_version)} el{' '}
          {textoFechaCorta(perfil.terminos_aceptados_en.slice(0, 10))}.
        </p>
      )}

      <section className="bloque-pagina">
        <p className="seccion-etiqueta">Tus datos</p>
        <div className="acciones-columna">
          <Link to="/mis-datos" className="boton-secundario">
            Ver o corregir mis datos
          </Link>
          <button
            type="button"
            className="boton-secundario"
            onClick={descargar}
            disabled={descargando || !usuario}
          >
            {descargando ? 'Armando el archivo…' : 'Descargar todos mis datos'}
          </button>
        </div>
      </section>

      <section className="bloque-pagina">
        <p className="seccion-etiqueta">Baja de la cuenta</p>
        {perfil?.baja_solicitada_en ? (
          <p className="hoy-mensaje-texto">
            Pediste la baja el {textoFechaCorta(perfil.baja_solicitada_en.slice(0, 10))}. Tu profe
            la va a procesar y se van a borrar tu cuenta y tus datos.
          </p>
        ) : confirmandoBaja ? (
          <div className="hoy-tarjeta hoy-tarjeta-mensaje">
            <p className="hoy-mensaje-texto">
              Se van a borrar tu cuenta, tus rutinas y todo tu historial. No se puede deshacer.
              ¿Seguro?
            </p>
            <div className="acciones-columna">
              <button
                type="button"
                className="boton-peligro"
                onClick={pedirBaja}
                disabled={enviandoBaja}
              >
                {enviandoBaja ? 'Enviando…' : 'Sí, pedir la baja'}
              </button>
              <button
                type="button"
                className="boton-secundario"
                onClick={() => setConfirmandoBaja(false)}
              >
                No, volver
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="boton-texto" onClick={() => setConfirmandoBaja(true)}>
            Pedir la baja de mi cuenta
          </button>
        )}
      </section>

      <BottomNav />
    </div>
  )
}
