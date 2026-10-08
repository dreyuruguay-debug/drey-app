import { useEffect, useState } from 'react'
import Esqueleto from './Esqueleto.jsx'
import { mostrarAviso } from '../services/avisos.js'
import {
  cargarPaginaInicio,
  guardarPaginaInicio,
  quitarArchivoPortada,
  subirArchivoPortada,
  textoDeErrorPortada,
  usePaginaInicio,
} from '../services/paginaInicio.js'
import {
  LARGO_MAXIMO_LINEA,
  LARGO_MAXIMO_PARRAFO,
  MAXIMO_PREGUNTAS,
  PREGUNTAS_POR_DEFECTO,
  SECCIONES_PORTADA,
  TEXTOS_POR_DEFECTO,
  VIDEOS_POR_DEFECTO,
  fundadorCompleto,
  preguntasDe,
  seccionVisible,
  textoDe,
} from '../data/paginaInicio.js'
import { numeroInternacional } from '../utils/whatsapp.js'
import { RUTA_VISTA_PREVIA } from '../data/rutas.js'

// Ajustes → Portada (solo el Admin): todo lo de la página de inicio.
//
//   · Videos de fondo (celular y compu): subir otro o volver al original.
//   · Una tarjeta por sección con sus textos y, si se puede, el
//     interruptor para mostrarla u ocultarla (se guarda al tocarlo).
//   · Fundador: también la foto. Preguntas: agregar, cambiar y borrar.
//
// Los campos vienen con el texto que se ve hoy. Si el Admin borra un
// campo y guarda, vuelve el texto original (data/paginaInicio.js).
// Cada cambio queda anotado en el Historial (supabase/sql/027).
export default function AjustesPortada() {
  const pagina = usePaginaInicio()
  const [cargando, setCargando] = useState(pagina === null)
  const [faltaBase, setFaltaBase] = useState(false)

  useEffect(() => {
    let activo = true
    cargarPaginaInicio().then(({ error }) => {
      if (!activo) return
      setCargando(false)
      setFaltaBase(Boolean(error) && /SQL 027/.test(textoDeErrorPortada(error)))
    })
    return () => {
      activo = false
    }
  }, [])

  if (cargando) return <Esqueleto />

  return (
    <>
      <p className="profe-nota">
        Es lo primero que ve quien entra a DREY sin haber iniciado sesión. Los cambios se ven al
        instante. Si borrás un texto y guardás, vuelve el original.
      </p>
      <a
        className="boton-secundario boton-chico portada-ajustes-ver"
        href={RUTA_VISTA_PREVIA}
        target="_blank"
        rel="noreferrer"
      >
        Ver la página de inicio ↗
      </a>

      {faltaBase && (
        <div className="aviso-baja">
          <strong>Falta instalar la actualización de la base (SQL 027)</strong>
          <span>
            Mientras tanto la página se ve con los textos originales y no se puede cambiar.
          </span>
        </div>
      )}

      <div className="lista-tarjetas portada-ajustes">
        <TarjetaVideos pagina={pagina} />
        {SECCIONES_PORTADA.map((seccion) => (
          <TarjetaSeccion key={seccion.id} seccion={seccion} pagina={pagina} />
        ))}
      </div>
    </>
  )
}

// Aviso según lo que respondió la base. Devuelve true si salió bien.
function avisar(error, textoOk) {
  if (!error) {
    mostrarAviso(textoOk)
    return true
  }
  mostrarAviso(textoDeErrorPortada(error), 'error')
  return false
}

// --- Videos ------------------------------------------------------------------

function TarjetaVideos({ pagina }) {
  return (
    <section className="ajustes-tarjeta">
      <div className="ajustes-tarjeta-cabecera">
        <strong>Videos de fondo</strong>
        <small>
          Uno vertical para el celular y uno horizontal para la compu. MP4 de 10 a 15 segundos, sin
          sonido. Ideal menos de 5 MB (máximo 30 MB): cuanto más liviano, más rápido carga.
        </small>
      </div>
      <div className="portada-ajustes-videos">
        <CampoArchivo
          tipo="video_celular"
          etiqueta="Celular (vertical)"
          actual={pagina?.videoCelularUrl}
          original={VIDEOS_POR_DEFECTO.celular}
          posterOriginal={VIDEOS_POR_DEFECTO.posterCelular}
          vertical
        />
        <CampoArchivo
          tipo="video_compu"
          etiqueta="Compu (horizontal)"
          actual={pagina?.videoCompuUrl}
          original={VIDEOS_POR_DEFECTO.compu}
          posterOriginal={VIDEOS_POR_DEFECTO.posterCompu}
        />
      </div>
    </section>
  )
}

// Subir / cambiar / quitar un archivo (video o la foto del fundador).
// actual: el que subió el Admin ('' = ninguno). original: el que viene
// con la app ('' = no hay, por ejemplo la foto). posterOriginal: la
// primera imagen del video original (se ve mientras carga).
function CampoArchivo({ tipo, etiqueta, actual, original, posterOriginal, vertical = false }) {
  const [trabajando, setTrabajando] = useState('')
  const esVideo = tipo !== 'foto_fundador'
  const vista = actual || original
  const clasesVista = [
    'portada-ajustes-vista',
    vertical ? 'portada-ajustes-vista-vertical' : '',
    tipo === 'foto_fundador' ? 'portada-ajustes-vista-foto' : '',
  ]
    .filter(Boolean)
    .join(' ')

  async function subir(archivo) {
    if (!archivo) return
    setTrabajando('subiendo')
    const error = await subirArchivoPortada(tipo, archivo)
    setTrabajando('')
    avisar(error, esVideo ? 'Video cambiado' : 'Foto guardada')
  }

  async function quitar() {
    setTrabajando('quitando')
    const error = await quitarArchivoPortada(tipo)
    setTrabajando('')
    avisar(error, esVideo ? 'Volvió el video original' : 'Foto quitada')
  }

  return (
    <div className="portada-ajustes-archivo">
      <span className="portada-ajustes-etiqueta">{etiqueta}</span>
      <div className="portada-ajustes-archivo-fila">
        {vista ? (
          esVideo ? (
            <video
              className={clasesVista}
              src={vista}
              poster={actual ? undefined : posterOriginal}
              muted
              loop
              playsInline
              autoPlay
              preload="metadata"
              aria-label={`Video actual: ${etiqueta}`}
            />
          ) : (
            <img className={clasesVista} src={vista} alt="Foto actual" />
          )
        ) : (
          <span className={`${clasesVista} portada-ajustes-vacia`}>Sin foto</span>
        )}
        <div className="mi-perfil-foto-botones">
          <label className="profe-adjuntar-imagen">
            {trabajando === 'subiendo'
              ? 'Subiendo…'
              : esVideo
                ? 'Cambiar video'
                : actual
                  ? 'Cambiar foto'
                  : 'Subir foto'}
            <input
              type="file"
              accept={esVideo ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp'}
              disabled={Boolean(trabajando)}
              onChange={(event) => {
                subir(event.target.files?.[0])
                event.target.value = ''
              }}
              hidden
            />
          </label>
          {actual && (
            <button
              type="button"
              className="profe-ejercicio-borrar"
              onClick={quitar}
              disabled={Boolean(trabajando)}
            >
              {trabajando === 'quitando'
                ? 'Quitando…'
                : esVideo
                  ? 'Volver al original'
                  : 'Quitar foto'}
            </button>
          )}
          {esVideo && !actual && <small className="portada-ajustes-nota">Es el original</small>}
        </div>
      </div>
    </div>
  )
}

// --- Una sección -------------------------------------------------------------

function TarjetaSeccion({ seccion, pagina }) {
  const visible = seccionVisible(pagina, seccion.id)
  const [cambiando, setCambiando] = useState(false)
  const sinFundador = seccion.id === 'fundador' && !fundadorCompleto(pagina)

  async function mostrarOcultar() {
    setCambiando(true)
    const error = await guardarPaginaInicio({ secciones: { [seccion.id]: !visible } })
    setCambiando(false)
    avisar(error, visible ? `${seccion.titulo}: oculta` : `${seccion.titulo}: se muestra`)
  }

  return (
    <section
      className={visible ? 'ajustes-tarjeta' : 'ajustes-tarjeta ajustes-tarjeta-oculta'}
      aria-label={seccion.titulo}
    >
      <div className="ajustes-interruptor">
        <span className="ajustes-interruptor-texto">
          <strong>{seccion.titulo}</strong>
          {seccion.detalle && <small>{seccion.detalle}</small>}
          {seccion.ocultable && !visible && <small>Oculta: no aparece en la página.</small>}
          {visible && sinFundador && (
            <small className="portada-ajustes-pendiente">
              Todavía no aparece: falta cargar el nombre, la foto o la historia.
            </small>
          )}
        </span>
        {seccion.ocultable && (
          <button
            type="button"
            className={visible ? 'interruptor interruptor-on' : 'interruptor'}
            role="switch"
            aria-checked={visible}
            aria-label={`Mostrar la sección ${seccion.titulo}`}
            disabled={cambiando}
            onClick={mostrarOcultar}
          />
        )}
      </div>

      {seccion.conFoto && (
        <CampoArchivo
          tipo="foto_fundador"
          etiqueta="Foto (vertical, de frente)"
          actual={pagina?.fotoFundadorUrl}
          original=""
        />
      )}

      <FormularioTextos seccion={seccion} pagina={pagina} />
    </section>
  )
}

function FormularioTextos({ seccion, pagina }) {
  const vigentes = {
    textos: Object.fromEntries(seccion.campos.map(({ clave }) => [clave, textoDe(pagina, clave)])),
    preguntas: seccion.conPreguntas ? preguntasDe(pagina) : [],
  }
  // null = sin cambios: el formulario muestra lo que se ve hoy (y se
  // actualiza solo si llega algo nuevo de la base). Al escribir, guarda
  // lo que el Admin va cambiando.
  const [borrador, setBorrador] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const formulario = borrador ?? vigentes
  const cambiado = borrador !== null && JSON.stringify(borrador) !== JSON.stringify(vigentes)

  function cambiarBorrador(cambio) {
    setBorrador((anterior) => cambio(anterior ?? vigentes))
  }

  function cambiarTexto(clave, valor) {
    cambiarBorrador((actual) => ({ ...actual, textos: { ...actual.textos, [clave]: valor } }))
    setMensaje('')
  }

  function cambiarPregunta(posicion, campo, valor) {
    cambiarBorrador((actual) => ({
      ...actual,
      preguntas: actual.preguntas.map((item, indice) =>
        indice === posicion ? { ...item, [campo]: valor } : item,
      ),
    }))
    setMensaje('')
  }

  function agregarPregunta() {
    cambiarBorrador((actual) => ({
      ...actual,
      preguntas: [...actual.preguntas, { pregunta: '', respuesta: '' }],
    }))
  }

  function borrarPregunta(posicion) {
    cambiarBorrador((actual) => ({
      ...actual,
      preguntas: actual.preguntas.filter((_item, indice) => indice !== posicion),
    }))
    setMensaje('')
  }

  async function guardar(event) {
    event.preventDefault()
    const problema = revisarFormulario(formulario, seccion)
    if (problema) {
      setMensaje(problema)
      return
    }
    // Lo que quedó igual al original no se guarda como propio: así, si
    // algún día cambia el original, se ve el nuevo.
    const textos = {}
    for (const { clave } of seccion.campos) {
      const valor = formulario.textos[clave].trim()
      textos[clave] = valor === TEXTOS_POR_DEFECTO[clave] ? null : valor
    }
    if (seccion.conPreguntas) {
      const lista = formulario.preguntas
        .map((item) => ({ pregunta: item.pregunta.trim(), respuesta: item.respuesta.trim() }))
        .filter((item) => item.pregunta || item.respuesta)
      textos['preguntas.lista'] =
        JSON.stringify(lista) === JSON.stringify(PREGUNTAS_POR_DEFECTO) ? null : lista
    }
    setGuardando(true)
    const error = await guardarPaginaInicio({ textos })
    setGuardando(false)
    if (avisar(error, `${seccion.titulo}: guardado`)) setBorrador(null)
  }

  function deshacer() {
    setBorrador(null)
    setMensaje('')
  }

  return (
    <form className="portada-ajustes-formulario" onSubmit={guardar}>
      {seccion.campos.map((campo) => (
        <CampoTexto
          key={campo.clave}
          campo={campo}
          valor={formulario.textos[campo.clave]}
          onCambiar={(valor) => cambiarTexto(campo.clave, valor)}
        />
      ))}

      {seccion.conPreguntas && (
        <div className="portada-ajustes-preguntas">
          <span className="portada-ajustes-etiqueta">
            Preguntas ({formulario.preguntas.length} de {MAXIMO_PREGUNTAS})
          </span>
          {formulario.preguntas.map((item, posicion) => (
            <div key={posicion} className="portada-ajustes-pregunta">
              <input
                className="auth-input"
                type="text"
                value={item.pregunta}
                maxLength={LARGO_MAXIMO_LINEA}
                placeholder="Pregunta"
                aria-label={`Pregunta ${posicion + 1}`}
                onChange={(event) => cambiarPregunta(posicion, 'pregunta', event.target.value)}
              />
              <textarea
                className="form-textarea"
                value={item.respuesta}
                maxLength={LARGO_MAXIMO_PARRAFO}
                placeholder="Respuesta"
                aria-label={`Respuesta ${posicion + 1}`}
                rows={3}
                onChange={(event) => cambiarPregunta(posicion, 'respuesta', event.target.value)}
              />
              <button
                type="button"
                className="profe-ejercicio-borrar"
                onClick={() => borrarPregunta(posicion)}
              >
                Borrar esta pregunta
              </button>
            </div>
          ))}
          {formulario.preguntas.length < MAXIMO_PREGUNTAS && (
            <button
              type="button"
              className="boton-secundario boton-chico"
              onClick={agregarPregunta}
            >
              + Agregar una pregunta
            </button>
          )}
          <small className="portada-ajustes-nota">
            En las respuestas podés escribir {'{dias_aviso}'} y {'{dias_de_gracia}'}: se cambian
            solos por los días de Ajustes → Plazos.
          </small>
        </div>
      )}

      {mensaje && <p className="auth-message">{mensaje}</p>}
      <div className="codigo-fila">
        {cambiado && (
          <button type="button" className="boton-secundario boton-chico" onClick={deshacer}>
            Deshacer
          </button>
        )}
        <button
          type="submit"
          className="boton-principal boton-chico"
          disabled={guardando || !cambiado}
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

function CampoTexto({ campo, valor, onCambiar }) {
  const original = TEXTOS_POR_DEFECTO[campo.clave]
  const maximo = campo.parrafo ? LARGO_MAXIMO_PARRAFO : LARGO_MAXIMO_LINEA
  const distintoDelOriginal = Boolean(original) && valor.trim() !== original
  return (
    <label className="ajustes-campo">
      <span>{campo.etiqueta}</span>
      {campo.parrafo ? (
        <textarea
          className="form-textarea"
          value={valor}
          maxLength={maximo}
          rows={3}
          placeholder={original || 'Vacío: no se muestra'}
          onChange={(event) => onCambiar(event.target.value)}
        />
      ) : (
        <input
          className="auth-input"
          type={campo.tipo || 'text'}
          value={valor}
          maxLength={maximo}
          placeholder={original || 'Vacío: no se muestra'}
          onChange={(event) => onCambiar(event.target.value)}
        />
      )}
      {distintoDelOriginal && (
        <button
          type="button"
          className="boton-texto-plano portada-ajustes-original"
          onClick={() => onCambiar(original)}
        >
          Volver al texto original
        </button>
      )}
    </label>
  )
}

// Devuelve el problema a corregir, o '' si está todo bien.
function revisarFormulario(formulario, seccion) {
  const whatsapp = formulario.textos['contacto.whatsapp']
  if (whatsapp?.trim() && !numeroInternacional(whatsapp)) {
    return 'Revisá el WhatsApp: escribí el celular con su número completo (ej. 099 123 456).'
  }
  if (seccion.conPreguntas) {
    const incompleta = formulario.preguntas.find(
      (item) => Boolean(item.pregunta.trim()) !== Boolean(item.respuesta.trim()),
    )
    if (incompleta) return 'Cada pregunta necesita su respuesta (o borrala).'
  }
  return ''
}
