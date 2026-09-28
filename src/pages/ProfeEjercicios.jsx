import { useEffect, useMemo, useState } from 'react'
import ProfeLayout from '../components/ProfeLayout.jsx'
import BibliotecaTabs from '../components/BibliotecaTabs.jsx'
import ConfirmacionEjercicio from '../components/ConfirmacionEjercicio.jsx'
import { supabase } from '../services/supabaseClient.js'
import { esAdminConocido, verificarProfe } from '../services/accesoProfe.js'
import {
  archivarEjercicio,
  bibliotecaRecordada,
  borrarEjercicio,
  cargarBiblioteca,
  usoDeEjercicio,
} from '../services/biblioteca.js'
import { CATEGORIAS, categoriasDeEjercicio } from '../data/categorias.js'
import { comprimirImagen, miniaturaDeEjercicio } from '../utils/imagenes.js'
import { ejerciciosActivos, estaArchivado, filtrarPorBusqueda } from '../utils/biblioteca.js'
import { normalizarLinkVideo } from '../utils/linkVideo.js'
import { normalizarTexto } from '../utils/texto.js'
import Esqueleto from '../components/Esqueleto.jsx'

// Filtros para encontrar rápido lo que falta cargar, y los archivados.
const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'sin-foto', label: 'Sin foto' },
  { id: 'sin-video', label: 'Sin video' },
  { id: 'archivados', label: 'Archivados' },
]

// Biblioteca de ejercicios, organizada en 7 categorías (Empuje,
// Tracción, Multiarticulares, Piernas, Zona media, Cardiorrespiratorio y
// Brazos), con buscador dentro de cada una. Un ejercicio puede estar en
// varias categorías: se eligen al editarlo. Estos son los ejercicios que después se usan para
// armar la rutina de cada cliente (ver "Clientes y rutinas" → un
// cliente → "+ Agregar ejercicio" dentro de una rutina).
//
// Arriba se ve cuántos ejercicios tienen foto y video, y los filtros "Sin
// foto" / "Sin video" muestran solo los que falta completar. Las fotos se
// achican solas antes de subirlas (cargan rápido en el celular). En la
// lista se ve la versión chica y quieta de cada foto, y solo se descargan
// las que aparecen en pantalla (la animación completa se ve al editar).
//
// El buscador no distingue tildes ni mayúsculas y también busca por
// músculo (utils/biblioteca.js).
//
// Biblioteca protegida (supabase/sql/024):
//   · "Archivar" (cualquier profe) en vez de borrar: el ejercicio sigue en
//     las rutinas y plantillas donde ya estaba, pero no aparece para
//     agregar. Antes de archivar se ve en cuántas rutinas está.
//   · "Archivados" los muestra (de todas las categorías) con "Recuperar".
//   · "Borrar" para siempre: solo el Admin, solo desde Archivados y solo si
//     no está en ninguna rutina ni plantilla (la base lo controla igual).
//   · Los links de video tienen que ser https:// (utils/linkVideo.js).
//
// Asignarle series/reps/peso a un cliente puntual se hace en el detalle
// de ese cliente, no acá.
export default function ProfeEjercicios() {
  // Lo último cargado se ve al instante; se actualiza por detrás.
  const [ejercicios, setEjercicios] = useState(() => bibliotecaRecordada() || [])
  const [cargando, setCargando] = useState(() => !bibliotecaRecordada())
  const [esAdmin, setEsAdmin] = useState(esAdminConocido)
  const [busqueda, setBusqueda] = useState('')
  const [categoriaActiva, setCategoriaActiva] = useState(CATEGORIAS[0].nombre)
  const [filtro, setFiltro] = useState('todos')

  const [nombreNuevo, setNombreNuevo] = useState('')
  const [videoNuevo, setVideoNuevo] = useState('')
  const [imagenNueva, setImagenNueva] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const [editandoId, setEditandoId] = useState(null)
  const [nombreEdit, setNombreEdit] = useState('')
  const [videoEdit, setVideoEdit] = useState('')
  const [imagenEdit, setImagenEdit] = useState(null)
  const [categoriasEdit, setCategoriasEdit] = useState([])
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)

  // Confirmación abierta: { id, accion: 'archivar' | 'borrar', estadoUso, uso }.
  const [confirmacion, setConfirmacion] = useState(null)
  const [trabajando, setTrabajando] = useState(false)
  const [recuperandoId, setRecuperandoId] = useState(null)

  useEffect(() => {
    let activo = true
    cargarEjercicios()
    verificarProfe().then(({ esAdmin: admin }) => activo && setEsAdmin(Boolean(admin)))
    return () => {
      activo = false
    }
  }, [])

  // Si falla (por ejemplo, sin señal) queda la lista que ya se veía.
  async function cargarEjercicios() {
    const { ejercicios: lista, error } = await cargarBiblioteca()
    if (!error) setEjercicios(lista)
    setCargando(false)
  }

  // Cambia un ejercicio en la lista de la pantalla sin esperar al servidor
  // (después se recarga igual).
  function cambiarEnLista(id, cambios) {
    setEjercicios((lista) =>
      cambios
        ? lista.map((item) => (item.id === id ? { ...item, ...cambios } : item))
        : lista.filter((item) => item.id !== id),
    )
  }

  // Sube una foto al almacenamiento de Supabase (bucket público
  // "ejercicios-fotos") y devuelve el link para guardar en la fila del
  // ejercicio. Si falla la subida, devuelve null y no rompe el guardado
  // del resto de los datos.
  async function subirImagen(original) {
    const archivo = await comprimirImagen(original, 900)
    const ruta = `${Date.now()}-${archivo.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase.storage.from('ejercicios-fotos').upload(ruta, archivo)
    if (error) return null
    const { data } = supabase.storage.from('ejercicios-fotos').getPublicUrl(ruta)
    return data?.publicUrl || null
  }

  async function handleAgregar(event) {
    event.preventDefault()
    const nombreLimpio = nombreNuevo.trim()
    if (!nombreLimpio) return

    // Evita crear un ejercicio "duplicado" por error (por ejemplo, para
    // agregarle una foto a uno que ya existe). Si ya hay uno con ese
    // nombre, avisa y no lo crea: hay que usar "Editar" en el de la lista
    // (o "Recuperar", si está archivado).
    // (Sin mirar tildes ni mayúsculas: "Pajaros" y "Pájaros" son el mismo.)
    const nombreComparable = normalizarTexto(nombreLimpio)
    const repetido = ejercicios.find(
      (ejercicio) => normalizarTexto(ejercicio.nombre) === nombreComparable,
    )
    if (repetido) {
      setMensaje(
        estaArchivado(repetido)
          ? `Ya existe "${repetido.nombre}", pero está archivado. Buscalo en "Archivados" y tocá "Recuperar".`
          : `Ya existe un ejercicio llamado "${nombreLimpio}". Para agregarle foto o video, buscalo arriba y tocá "Editar" en vez de crear uno nuevo.`,
      )
      return
    }

    const video = normalizarLinkVideo(videoNuevo)
    if (video.error) {
      setMensaje(video.error)
      return
    }

    setGuardando(true)
    setMensaje('')

    let imagenUrl = null
    if (imagenNueva) {
      imagenUrl = await subirImagen(imagenNueva)
    }

    const { error } = await supabase.from('ejercicios').insert({
      nombre: nombreLimpio,
      grupo_muscular: categoriaActiva,
      categorias: [categoriaActiva],
      video_url: video.valor,
      imagen_url: imagenUrl,
    })
    setGuardando(false)
    if (error) {
      setMensaje('No pudimos guardar el ejercicio. Probá de nuevo.')
      return
    }
    setNombreNuevo('')
    setVideoNuevo('')
    setImagenNueva(null)
    cargarEjercicios()
  }

  // Archivar o borrar: primero se abre la confirmación y se cuenta en
  // cuántas rutinas está (en paralelo; el texto se completa al llegar).
  async function pedirConfirmacion(ejercicio, accion) {
    setEditandoId(null)
    setMensaje('')
    setConfirmacion({ id: ejercicio.id, accion, estadoUso: 'cargando', uso: null })
    const { uso, error } = await usoDeEjercicio(ejercicio.id)
    // Si mientras tanto se cerró o se abrió otra, no se toca.
    setConfirmacion((actual) =>
      actual?.id === ejercicio.id && actual.accion === accion
        ? { ...actual, estadoUso: error ? 'error' : 'listo', uso }
        : actual,
    )
  }

  function cerrarConfirmacion() {
    if (!trabajando) setConfirmacion(null)
  }

  async function confirmar(ejercicio) {
    if (!confirmacion || trabajando) return
    setTrabajando(true)
    if (confirmacion.accion === 'archivar') {
      const { error } = await archivarEjercicio(ejercicio.id, true)
      if (error) {
        setMensaje('No pudimos archivarlo. Probá de nuevo.')
      } else {
        cambiarEnLista(ejercicio.id, { archivado_en: new Date().toISOString() })
        setMensaje(`"${ejercicio.nombre}" quedó archivado. Lo encontrás en "Archivados".`)
      }
    } else {
      const { error, motivo } = await borrarEjercicio(ejercicio, ejercicios)
      if (!error) {
        cambiarEnLista(ejercicio.id, null)
        setMensaje(`"${ejercicio.nombre}" se borró de la biblioteca.`)
      } else if (motivo === 'en-uso') {
        setMensaje(
          `"${ejercicio.nombre}" está en una rutina o plantilla: no se puede borrar. Queda archivado.`,
        )
      } else if (motivo === 'sin-permiso') {
        setMensaje('Solo el Admin puede borrar ejercicios de la biblioteca.')
      } else {
        setMensaje('No pudimos borrarlo. Probá de nuevo.')
      }
    }
    setTrabajando(false)
    setConfirmacion(null)
    cargarEjercicios()
  }

  async function recuperar(ejercicio) {
    if (recuperandoId) return
    setRecuperandoId(ejercicio.id)
    setConfirmacion(null)
    setMensaje('')
    const { error } = await archivarEjercicio(ejercicio.id, false)
    setRecuperandoId(null)
    if (error) {
      setMensaje('No pudimos recuperarlo. Probá de nuevo.')
      return
    }
    cambiarEnLista(ejercicio.id, { archivado_en: null })
    setMensaje(
      `"${ejercicio.nombre}" volvió a la biblioteca (${categoriasDeEjercicio(ejercicio).join(' y ')}).`,
    )
    cargarEjercicios()
  }

  function empezarEdicion(ejercicio) {
    setConfirmacion(null)
    setEditandoId(ejercicio.id)
    setNombreEdit(ejercicio.nombre)
    setVideoEdit(ejercicio.video_url || '')
    setImagenEdit(null)
    setCategoriasEdit(categoriasDeEjercicio(ejercicio))
    setMensaje('')
  }

  function alternarCategoriaEdit(nombre) {
    setCategoriasEdit((actual) =>
      actual.includes(nombre) ? actual.filter((item) => item !== nombre) : [...actual, nombre],
    )
  }

  function cancelarEdicion() {
    setEditandoId(null)
  }

  async function guardarEdicion(ejercicio) {
    if (!nombreEdit.trim()) return
    if (categoriasEdit.length === 0) {
      setMensaje('Elegí al menos una categoría para el ejercicio.')
      return
    }
    const video = normalizarLinkVideo(videoEdit)
    if (video.error) {
      setMensaje(video.error)
      return
    }
    setGuardandoEdicion(true)
    setMensaje('')

    let imagenUrl = ejercicio.imagen_url || null
    if (imagenEdit) {
      const subida = await subirImagen(imagenEdit)
      if (subida) imagenUrl = subida
    }

    const { error } = await supabase
      .from('ejercicios')
      .update({
        nombre: nombreEdit.trim(),
        video_url: video.valor,
        imagen_url: imagenUrl,
        categorias: categoriasEdit,
      })
      .eq('id', ejercicio.id)

    setGuardandoEdicion(false)
    if (error) {
      setMensaje('No pudimos guardar los cambios. Probá de nuevo.')
      return
    }
    setEditandoId(null)
    cargarEjercicios()
  }

  function elegirCategoria(nombre) {
    setCategoriaActiva(nombre)
    // Tocar una categoría estando en "Archivados" vuelve a la lista normal.
    if (filtro === 'archivados') setFiltro('todos')
  }

  const activos = useMemo(() => ejerciciosActivos(ejercicios), [ejercicios])
  const archivados = useMemo(() => ejercicios.filter(estaArchivado), [ejercicios])
  const verArchivados = filtro === 'archivados'

  const visibles = useMemo(() => {
    if (verArchivados) return filtrarPorBusqueda(archivados, busqueda)
    const deLaCategoria = activos.filter((ejercicio) =>
      categoriasDeEjercicio(ejercicio).includes(categoriaActiva),
    )
    return filtrarPorBusqueda(deLaCategoria, busqueda).filter((ejercicio) =>
      filtro === 'sin-foto'
        ? !ejercicio.imagen_url
        : filtro === 'sin-video'
          ? !ejercicio.video_url
          : true,
    )
  }, [activos, archivados, verArchivados, categoriaActiva, busqueda, filtro])
  const conFoto = useMemo(
    () => activos.filter((ejercicio) => ejercicio.imagen_url).length,
    [activos],
  )
  const conVideo = useMemo(
    () => activos.filter((ejercicio) => ejercicio.video_url).length,
    [activos],
  )

  const textoVacio = verArchivados
    ? busqueda.trim()
      ? 'No hay ejercicios archivados que coincidan.'
      : 'No hay ejercicios archivados.'
    : filtro === 'todos'
      ? `Todavía no hay ejercicios de ${categoriaActiva}.`
      : `En ${categoriaActiva} no falta ninguno. ¡Bien!`

  return (
    <ProfeLayout titulo="Biblioteca">
      <BibliotecaTabs activa="ejercicios" />
      <p className="profe-nota">
        Elegí una categoría, buscá (por nombre o músculo, con o sin tildes), agregá o editá
        ejercicios (nombre, categorías, foto y link de video). Si uno ya no se usa, archivalo: sigue
        en las rutinas donde está, pero no aparece para agregar. Para asignarle uno a un cliente,
        entrá a "Clientes y rutinas" → el cliente → su rutina → "+ Agregar ejercicio".
      </p>

      {activos.length > 0 && (
        <div className="biblioteca-avance">
          <BarraAvance etiqueta="Con foto" cantidad={conFoto} total={activos.length} />
          <BarraAvance etiqueta="Con video" cantidad={conVideo} total={activos.length} />
        </div>
      )}

      <div className="profe-grupos-grid">
        {CATEGORIAS.map(({ nombre, musculos }) => (
          <button
            key={nombre}
            type="button"
            className={
              nombre === categoriaActiva && !verArchivados
                ? 'profe-grupo-card profe-grupo-card-activo'
                : 'profe-grupo-card'
            }
            onClick={() => elegirCategoria(nombre)}
          >
            {nombre}
            <span className="profe-grupo-card-musculos">{musculos}</span>
          </button>
        ))}
      </div>

      <input
        className="auth-input profe-buscador"
        type="text"
        placeholder={verArchivados ? 'Buscar en archivados…' : `Buscar en ${categoriaActiva}…`}
        value={busqueda}
        onChange={(event) => setBusqueda(event.target.value)}
      />

      <div className="chips-lista biblioteca-filtros">
        {FILTROS.map((opcion) => (
          <button
            key={opcion.id}
            type="button"
            className={opcion.id === filtro ? 'chip chip-activo' : 'chip'}
            onClick={() => setFiltro(opcion.id)}
          >
            {opcion.label}
            {opcion.id === 'archivados' && archivados.length > 0 && ` (${archivados.length})`}
          </button>
        ))}
      </div>

      {verArchivados && (
        <p className="profe-nota">
          Archivados de todas las categorías. Siguen igual en las rutinas donde ya estaban; tocá
          "Recuperar" para volver a usarlos.
        </p>
      )}

      {mensaje && (
        <p className="auth-message" role="status">
          {mensaje}
        </p>
      )}

      {cargando ? (
        <Esqueleto />
      ) : visibles.length === 0 ? (
        <p className="profe-vacio">{textoVacio}</p>
      ) : (
        <div className="profe-ejercicios-lista">
          {visibles.map((ejercicio) =>
            editandoId === ejercicio.id ? (
              <div key={ejercicio.id} className="profe-ejercicio-edicion">
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Nombre del ejercicio"
                  value={nombreEdit}
                  onChange={(event) => setNombreEdit(event.target.value)}
                  required
                />
                <input
                  className="auth-input"
                  type="text"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Link del video, https://… (opcional)"
                  value={videoEdit}
                  onChange={(event) => setVideoEdit(event.target.value)}
                />
                <p className="editor-ejercicio-categorias">Categorías (podés elegir varias):</p>
                <div className="categorias-chips">
                  {CATEGORIAS.map(({ nombre }) => (
                    <button
                      key={nombre}
                      type="button"
                      className={
                        categoriasEdit.includes(nombre)
                          ? 'descanso-chip descanso-chip-activo'
                          : 'descanso-chip'
                      }
                      onClick={() => alternarCategoriaEdit(nombre)}
                    >
                      {nombre}
                    </button>
                  ))}
                </div>
                <div className="profe-imagen-actual">
                  {ejercicio.imagen_url && (
                    <img
                      src={ejercicio.imagen_url}
                      alt={ejercicio.nombre}
                      className="profe-ejercicio-foto-preview"
                    />
                  )}
                  <label className="profe-adjuntar-imagen">
                    {imagenEdit ? imagenEdit.name : 'Cambiar foto (opcional)'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setImagenEdit(event.target.files?.[0] ?? null)}
                      hidden
                    />
                  </label>
                </div>
                <div className="profe-ejercicio-edicion-botones">
                  <button
                    type="button"
                    className="pill-button"
                    disabled={guardandoEdicion}
                    onClick={() => guardarEdicion(ejercicio)}
                  >
                    {guardandoEdicion ? 'Guardando…' : 'Guardar'}
                  </button>
                  <button type="button" className="profe-cerrar-selector" onClick={cancelarEdicion}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : confirmacion?.id === ejercicio.id ? (
              <ConfirmacionEjercicio
                key={ejercicio.id}
                ejercicio={ejercicio}
                accion={confirmacion.accion}
                estadoUso={confirmacion.estadoUso}
                uso={confirmacion.uso}
                trabajando={trabajando}
                onConfirmar={() => confirmar(ejercicio)}
                onCancelar={cerrarConfirmacion}
              />
            ) : (
              <FilaEjercicio
                key={ejercicio.id}
                ejercicio={ejercicio}
                esAdmin={esAdmin}
                recuperando={recuperandoId === ejercicio.id}
                onEditar={() => empezarEdicion(ejercicio)}
                onArchivar={() => pedirConfirmacion(ejercicio, 'archivar')}
                onRecuperar={() => recuperar(ejercicio)}
                onBorrar={() => pedirConfirmacion(ejercicio, 'borrar')}
              />
            ),
          )}
        </div>
      )}

      <p className="profe-seccion-label">Agregar ejercicio a {categoriaActiva}</p>
      <form className="profe-form-ejercicio" onSubmit={handleAgregar}>
        <input
          className="auth-input"
          type="text"
          placeholder="Nombre del ejercicio"
          value={nombreNuevo}
          onChange={(event) => setNombreNuevo(event.target.value)}
          required
        />
        <input
          className="auth-input"
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Link del video, https://… (opcional)"
          value={videoNuevo}
          onChange={(event) => setVideoNuevo(event.target.value)}
        />
        <label className="profe-adjuntar-imagen">
          {imagenNueva ? imagenNueva.name : 'Adjuntar foto (opcional)'}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setImagenNueva(event.target.files?.[0] ?? null)}
            hidden
          />
        </label>
        <button type="submit" className="pill-button" disabled={guardando}>
          {guardando ? 'Agregando…' : 'Agregar'}
        </button>
      </form>
    </ProfeLayout>
  )
}

// Un ejercicio de la lista. En uso: "Editar" y "Archivar". Archivado:
// "Recuperar" y, solo para el Admin, "Borrar" (para siempre).
function FilaEjercicio({
  ejercicio,
  esAdmin,
  recuperando,
  onEditar,
  onArchivar,
  onRecuperar,
  onBorrar,
}) {
  const archivado = estaArchivado(ejercicio)
  return (
    <div className="profe-ejercicio-item">
      <div className="profe-ejercicio-item-info">
        {ejercicio.imagen_url && (
          <img
            src={miniaturaDeEjercicio(ejercicio.imagen_url)}
            alt=""
            className="profe-ejercicio-foto-mini"
            width="48"
            height="48"
            loading="lazy"
            decoding="async"
          />
        )}
        <span>
          {ejercicio.nombre}
          {archivado && (
            <small className="selector-item-categorias">
              {categoriasDeEjercicio(ejercicio).join(' · ')}
            </small>
          )}
        </span>
      </div>
      <div className="profe-ejercicio-item-acciones">
        {archivado ? (
          <>
            <button
              type="button"
              className="profe-ejercicio-agregar"
              disabled={recuperando}
              onClick={onRecuperar}
            >
              {recuperando ? 'Recuperando…' : 'Recuperar'}
            </button>
            {esAdmin && (
              <button type="button" className="profe-ejercicio-borrar" onClick={onBorrar}>
                Borrar
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="profe-ejercicio-agregar" onClick={onEditar}>
              Editar
            </button>
            <button type="button" className="profe-ejercicio-archivar" onClick={onArchivar}>
              Archivar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function BarraAvance({ etiqueta, cantidad, total }) {
  const porcentaje = total ? Math.round((cantidad / total) * 100) : 0
  return (
    <div className="barra-avance">
      <span>
        {etiqueta}: {cantidad} de {total}
      </span>
      <span className="barra-avance-fondo" aria-hidden="true">
        <span className="barra-avance-relleno" style={{ width: `${porcentaje}%` }} />
      </span>
    </div>
  )
}
