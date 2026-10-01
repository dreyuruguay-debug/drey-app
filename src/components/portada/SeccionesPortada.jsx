import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Aparece from './Aparece.jsx'
import TarjetaProfe from '../TarjetaProfe.jsx'
import { cargarProfesDisponibles } from '../../services/profes.js'
import { formatearPrecio, listaDePlanes } from '../../data/planes.js'
import { conPlazos, preguntasDe, textoDe } from '../../data/paginaInicio.js'
import { linkWhatsApp } from '../../utils/whatsapp.js'

// Secciones que van debajo del video en la página de inicio
// (pages/Portada.jsx). Cada una recibe la página (textos del Admin) y lee
// sus textos con textoDe(), que usa el original si el Admin no escribió
// otro. Qué secciones se muestran lo decide Portada.jsx.

// Antetítulo verde + título grande (+ texto opcional): el comienzo de
// todas las secciones.
function Encabezado({ pagina, seccion, conTexto = true }) {
  const texto = conTexto ? textoDe(pagina, `${seccion}.texto`) : ''
  return (
    <>
      <p className="portada-antetitulo">{textoDe(pagina, `${seccion}.antetitulo`)}</p>
      <h2 className="portada-h2">{textoDe(pagina, `${seccion}.titulo`)}</h2>
      {texto && <p className="portada-texto">{texto}</p>}
    </>
  )
}

function Seccion({ id, className = '', children }) {
  return (
    <section id={id} className={`portada-seccion ${className}`.trim()}>
      <Aparece className="portada-seccion-interior">{children}</Aparece>
    </section>
  )
}

// Objetivo y Misión: antetítulo, título y texto.
export function SeccionTexto({ pagina, seccion, destacada = false }) {
  return (
    <Seccion id={`portada-${seccion}`} className={destacada ? 'portada-destacada' : ''}>
      <Encabezado pagina={pagina} seccion={seccion} />
    </Seccion>
  )
}

export function SeccionComoFunciona({ pagina }) {
  const pasos = [1, 2, 3].map((numero) => ({
    numero,
    titulo: textoDe(pagina, `como.paso${numero}Titulo`),
    texto: textoDe(pagina, `como.paso${numero}Texto`),
  }))
  return (
    <Seccion id="portada-como">
      <Encabezado pagina={pagina} seccion="como" conTexto={false} />
      <ol className="portada-pasos">
        {pasos.map((paso) => (
          <li key={paso.numero} className="portada-paso">
            <span className="portada-paso-numero" aria-hidden="true">
              {paso.numero}
            </span>
            <h3>{paso.titulo}</h3>
            <p>{paso.texto}</p>
          </li>
        ))}
      </ol>
    </Seccion>
  )
}

export function SeccionFundador({ pagina }) {
  const nombre = textoDe(pagina, 'fundador.nombre')
  const rol = textoDe(pagina, 'fundador.rol')
  const cita = textoDe(pagina, 'fundador.cita')
  const historia = textoDe(pagina, 'fundador.historia')
  const foto = pagina?.fotoFundadorUrl
  return (
    <Seccion id="portada-fundador">
      <div className={foto ? 'portada-fundador' : 'portada-fundador portada-fundador-sin-foto'}>
        {foto && (
          <img
            className="portada-fundador-foto"
            src={foto}
            alt={nombre ? `Foto de ${nombre}` : 'Foto del fundador'}
            loading="lazy"
          />
        )}
        <div className="portada-fundador-textos">
          <Encabezado pagina={pagina} seccion="fundador" conTexto={false} />
          {cita && <blockquote className="portada-cita">{cita}</blockquote>}
          {historia && <p className="portada-texto">{historia}</p>}
          {(nombre || rol) && (
            <p className="portada-firma">
              {nombre && <strong>{nombre}</strong>}
              {rol && <span>{rol}</span>}
            </p>
          )}
        </div>
      </div>
    </Seccion>
  )
}

// Profes con su perfil público (supabase/sql/026). Si todavía no hay
// ninguno, la sección no se muestra.
const MAXIMO_PROFES = 6

export function SeccionProfes({ pagina }) {
  const [profes, setProfes] = useState(null)

  useEffect(() => {
    let activo = true
    cargarProfesDisponibles().then(({ profes: lista }) => {
      if (activo) setProfes(lista.slice(0, MAXIMO_PROFES))
    })
    return () => {
      activo = false
    }
  }, [])

  if (!profes?.length) return null
  return (
    <Seccion id="portada-profes">
      <Encabezado pagina={pagina} seccion="profes" />
      <div className="portada-profes">
        {profes.map((profe) => (
          <TarjetaProfe key={profe.id} profe={profe} />
        ))}
      </div>
    </Seccion>
  )
}

// Planes visibles de Ajustes → Planes, con sus precios.
export function SeccionPlanes({ pagina }) {
  const planes = listaDePlanes({ soloVisibles: true })
  if (!planes.length) return null
  return (
    <Seccion id="portada-planes">
      <Encabezado pagina={pagina} seccion="planes" />
      <div className="portada-planes">
        {planes.map((plan, posicion) => {
          const mismoPrecio = plan.precioPrimerMes === plan.precioDesdeSegundoMes
          return (
            <article
              key={plan.id}
              className={posicion === 0 ? 'portada-plan portada-plan-destacado' : 'portada-plan'}
            >
              <h3>{plan.nombre}</h3>
              {plan.descripcion && <p className="portada-plan-descripcion">{plan.descripcion}</p>}
              <p className="portada-plan-precio">
                {formatearPrecio(plan.precioPrimerMes)}
                <small>{mismoPrecio ? 'por mes' : 'el primer mes'}</small>
              </p>
              {!mismoPrecio && (
                <p className="portada-plan-siguiente">
                  Después {formatearPrecio(plan.precioDesdeSegundoMes)} por mes
                </p>
              )}
              <Link
                to={`/registro?plan=${encodeURIComponent(plan.id)}`}
                className={
                  posicion === 0
                    ? 'portada-boton portada-boton-lleno'
                    : 'portada-boton portada-boton-borde'
                }
              >
                Empezar
              </Link>
            </article>
          )
        })}
      </div>
    </Seccion>
  )
}

export function SeccionSumate({ pagina }) {
  const puntos = [1, 2, 3, 4]
    .map((numero) => textoDe(pagina, `sumate.punto${numero}`))
    .filter(Boolean)
  const whatsapp = linkWhatsApp(
    textoDe(pagina, 'contacto.whatsapp'),
    'Hola! Soy profe y quiero sumarme a DREY.',
  )
  return (
    <Seccion id="portada-sumate">
      <div className="portada-sumate">
        <div>
          <Encabezado pagina={pagina} seccion="sumate" />
          {whatsapp && (
            <a
              className="portada-boton portada-boton-borde portada-sumate-boton"
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
            >
              Quiero sumarme
            </a>
          )}
        </div>
        {puntos.length > 0 && (
          <ul className="portada-lista-tilde">
            {puntos.map((punto) => (
              <li key={punto}>{punto}</li>
            ))}
          </ul>
        )}
      </div>
    </Seccion>
  )
}

export function SeccionPreguntas({ pagina, plazos }) {
  const preguntas = preguntasDe(pagina)
  if (!preguntas.length) return null
  return (
    <Seccion id="portada-preguntas">
      <Encabezado pagina={pagina} seccion="preguntas" conTexto={false} />
      <div className="portada-preguntas">
        {preguntas.map((item) => (
          <details key={item.pregunta} className="portada-pregunta">
            <summary>{item.pregunta}</summary>
            <p>{conPlazos(item.respuesta, plazos)}</p>
          </details>
        ))}
      </div>
    </Seccion>
  )
}
