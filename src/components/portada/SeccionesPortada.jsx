import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Aparece from './Aparece.jsx'
import TarjetaProfe from '../TarjetaProfe.jsx'
import { cargarProfesDisponibles } from '../../services/profes.js'
import { cargarPlanesDrey } from '../../services/suscripcionDrey.js'
import { useConfiguracion } from '../../services/configuracion.js'
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

// Planes (decisión D6: DREY se presenta como plataforma): los planes
// DREY visibles de Ajustes → DREY, para profes y para gimnasios, con la
// prueba gratis y el botón para registrarse con ese plan elegido
// (/registro/profe?plan=… o /registro/gimnasio?plan=…). Abajo, "Soy
// alumno" para quien busca a su profe o gimnasio. Si la base todavía no
// tiene los planes DREY (SQL 032), se muestran los planes de alumnos de
// siempre.
export function SeccionPlanes({ pagina }) {
  const config = useConfiguracion()
  const [planesDrey, setPlanesDrey] = useState(null)

  useEffect(() => {
    let activo = true
    cargarPlanesDrey().then(({ planes, error }) => {
      if (activo) setPlanesDrey(error ? [] : planes.filter((plan) => plan.activo))
    })
    return () => {
      activo = false
    }
  }, [])

  if (planesDrey === null) return null
  if (!planesDrey.length) return <PlanesDeAlumnos pagina={pagina} />

  const prueba = config.prueba || { activa: true, dias: 14, cupos: 3 }
  const grupos = [
    { tipo: 'profe', titulo: 'Para profes', ruta: '/registro/profe' },
    { tipo: 'gimnasio', titulo: 'Para gimnasios', ruta: '/registro/gimnasio' },
  ]
    .map((grupo) => ({ ...grupo, planes: planesDrey.filter((plan) => plan.tipo === grupo.tipo) }))
    .filter((grupo) => grupo.planes.length)

  return (
    <Seccion id="portada-planes">
      <Encabezado pagina={pagina} seccion="planes" />
      {prueba.activa && (
        <p className="portada-texto portada-prueba">
          Probalo gratis {prueba.dias} días con hasta {prueba.cupos} alumnos, sin tarjeta.
        </p>
      )}
      {grupos.map((grupo) => (
        <div key={grupo.tipo} className="portada-planes-grupo">
          <h3 className="portada-planes-subtitulo">{grupo.titulo}</h3>
          <div className="portada-planes">
            {grupo.planes.map((plan, posicion) => (
              <article
                key={plan.id}
                className={posicion === 1 ? 'portada-plan portada-plan-destacado' : 'portada-plan'}
              >
                <h3>{plan.nombre}</h3>
                <p className="portada-plan-descripcion">
                  {plan.descripcion || `Hasta ${plan.cupos} alumnos a la vez`}
                </p>
                <p className="portada-plan-precio">
                  {formatearPrecio(plan.precioMensual)}
                  <small>por mes</small>
                </p>
                {plan.precioPrimerMes != null && plan.precioPrimerMes !== plan.precioMensual && (
                  <p className="portada-plan-siguiente">
                    Primer mes {formatearPrecio(plan.precioPrimerMes)}
                  </p>
                )}
                <Link
                  to={`${grupo.ruta}?plan=${encodeURIComponent(plan.id)}`}
                  className={
                    posicion === 1
                      ? 'portada-boton portada-boton-lleno'
                      : 'portada-boton portada-boton-borde'
                  }
                >
                  {prueba.activa ? 'Probar gratis' : 'Empezar'}
                </Link>
              </article>
            ))}
          </div>
        </div>
      ))}
      <div className="portada-soy-alumno">
        <p className="portada-texto">
          ¿Sos alumno? Registrate y elegí a tu profe o gimnasio (o escribí el código que te
          pasaron).
        </p>
        <Link to="/registro/alumno" className="portada-boton portada-boton-borde">
          Soy alumno
        </Link>
      </div>
    </Seccion>
  )
}

// Los planes de alumnos de siempre (Ajustes → Planes), mientras la base
// no tenga los planes DREY.
function PlanesDeAlumnos({ pagina }) {
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
          {/* Registro directo de profes y gimnasios (SQL 033, D8). */}
          <div className="portada-sumate-botones">
            <Link to="/registro/profe" className="portada-boton portada-boton-lleno">
              Soy profe
            </Link>
            <Link to="/registro/gimnasio" className="portada-boton portada-boton-borde">
              Tengo un gimnasio
            </Link>
            {whatsapp && (
              <a
                className="portada-boton portada-boton-borde portada-sumate-boton"
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
              >
                Hablar por WhatsApp
              </a>
            )}
          </div>
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
