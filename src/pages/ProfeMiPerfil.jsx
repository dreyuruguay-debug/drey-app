import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import TarjetaProfe from '../components/TarjetaProfe.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { mostrarAviso } from '../services/avisos.js'
import { esAdminConocido, verificarProfe } from '../services/accesoProfe.js'
import {
  borrarFotoDeProfe,
  cargarPerfilDeProfe,
  guardarFotoDePerfil,
  guardarPerfilDeProfe,
  subirFotoDeProfe,
} from '../services/profes.js'
import {
  ESPECIALIDADES_SUGERIDAS,
  MAXIMO_DESCRIPCION_PROFE,
  MAXIMO_ESPECIALIDADES,
  MODALIDADES,
} from '../data/especialidades.js'

// "Mi perfil de profe" (supabase/sql/026): lo que ven los alumnos al
// elegir profe. Foto, especialidades (las sugeridas o propias),
// modalidad (presencial / online), años de experiencia, Instagram y una
// descripción. "Tomo alumnos nuevos: No" lo saca de la lista para pedir
// (los alumnos que ya tiene siguen igual). Al lado se ve cómo queda.
//
// El Admin puede abrir el de cualquier profe desde Equipo
// (/profe/mi-perfil?profe=<id>) para completarlo o corregirlo.
export default function ProfeMiPerfil() {
  const [parametros] = useSearchParams()
  const profeId = parametros.get('profe')
  const [esAdmin, setEsAdmin] = useState(esAdminConocido)
  const [cargando, setCargando] = useState(true)
  const [profe, setProfe] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [especialidadNueva, setEspecialidadNueva] = useState('')
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    verificarProfe().then(({ esAdmin: admin }) => activo && setEsAdmin(Boolean(admin)))
    cargarPerfilDeProfe(profeId).then((resultado) => {
      if (!activo) return
      setProfe(resultado.profe)
      setPerfil(resultado.perfil)
      setCargando(false)
    })
    return () => {
      activo = false
    }
  }, [profeId])

  function cambiar(campo, valor) {
    setPerfil((actual) => ({ ...actual, [campo]: valor }))
  }

  function alternarEnLista(campo, valor) {
    setPerfil((actual) => {
      const lista = actual[campo] || []
      return {
        ...actual,
        [campo]: lista.includes(valor) ? lista.filter((item) => item !== valor) : [...lista, valor],
      }
    })
  }

  function agregarEspecialidad(event) {
    event.preventDefault()
    const texto = especialidadNueva.trim().slice(0, 40)
    if (!texto) return
    const yaEsta = perfil.especialidades.some((item) => item.toLowerCase() === texto.toLowerCase())
    if (!yaEsta) cambiar('especialidades', [...perfil.especialidades, texto])
    setEspecialidadNueva('')
  }

  async function elegirFoto(archivo) {
    if (!archivo) return
    setSubiendoFoto(true)
    const url = await subirFotoDeProfe(perfil.profe_id, archivo)
    setSubiendoFoto(false)
    if (!url || (await guardarFotoDePerfil(perfil.profe_id, url))) {
      mostrarAviso('No pudimos subir la foto', 'error')
      return
    }
    await borrarFotoDeProfe(perfil.foto_url)
    cambiar('foto_url', url)
    mostrarAviso('Foto guardada')
  }

  async function quitarFoto() {
    if (await guardarFotoDePerfil(perfil.profe_id, null)) {
      mostrarAviso('No pudimos quitar la foto', 'error')
      return
    }
    await borrarFotoDeProfe(perfil.foto_url)
    cambiar('foto_url', null)
  }

  async function guardar(event) {
    event.preventDefault()
    if (perfil.especialidades.length > MAXIMO_ESPECIALIDADES) {
      setError(`Elegí hasta ${MAXIMO_ESPECIALIDADES} especialidades.`)
      return
    }
    setError('')
    setGuardando(true)
    const fallo = await guardarPerfilDeProfe(perfil)
    setGuardando(false)
    if (fallo) {
      setError('No pudimos guardar el perfil. Probá de nuevo.')
      return
    }
    mostrarAviso('Perfil guardado')
  }

  const titulo = profeId && esAdmin ? 'Perfil del profe' : 'Mi perfil de profe'
  const volverA = profeId && esAdmin ? '/profe/equipo' : '/profe/mi-cuenta'

  if (cargando || !perfil) {
    return (
      <ProfeLayout titulo={titulo} volverA={volverA}>
        <Esqueleto filas={4} />
      </ProfeLayout>
    )
  }

  if (!profe?.es_profe) {
    return (
      <ProfeLayout titulo={titulo} volverA={volverA}>
        <p className="profe-vacio">
          {esAdmin && !profeId
            ? 'La cuenta Admin no es profe: abrí el perfil de un profe desde Equipo.'
            : 'Esta cuenta no es de un profe.'}
        </p>
      </ProfeLayout>
    )
  }

  const nombre = `${profe.nombre || ''} ${profe.apellido || ''}`.trim()
  const especialidadesPropias = perfil.especialidades.filter(
    (item) => !ESPECIALIDADES_SUGERIDAS.includes(item),
  )
  const vistaPrevia = { ...perfil, id: perfil.profe_id, nombre, gimnasio: null }

  return (
    <ProfeLayout titulo={titulo} volverA={volverA}>
      <p className="profe-nota">
        {profeId && esAdmin
          ? `Lo que ven los alumnos de ${nombre} cuando eligen profe.`
          : 'Esto es lo que ven los alumnos cuando eligen profe. Contales en qué te especializás y cómo trabajás: es tu carta de presentación.'}
      </p>

      <div className="mi-perfil-grilla">
        <form className="mi-perfil-formulario" onSubmit={guardar}>
          <section className="mi-perfil-seccion">
            <p className="seccion-etiqueta">Foto</p>
            <div className="mi-perfil-foto">
              {perfil.foto_url ? (
                <img src={perfil.foto_url} alt="Tu foto de perfil" />
              ) : (
                <span className="mi-perfil-foto-vacia" aria-hidden="true">
                  Sin foto
                </span>
              )}
              <div className="mi-perfil-foto-botones">
                <label className="profe-adjuntar-imagen">
                  {subiendoFoto ? 'Subiendo…' : perfil.foto_url ? 'Cambiar foto' : 'Subir foto'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={subiendoFoto}
                    onChange={(event) => elegirFoto(event.target.files?.[0])}
                    hidden
                  />
                </label>
                {perfil.foto_url && (
                  <button type="button" className="profe-ejercicio-borrar" onClick={quitarFoto}>
                    Quitar foto
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="mi-perfil-seccion">
            <p className="seccion-etiqueta">
              Especialidades ({perfil.especialidades.length} de {MAXIMO_ESPECIALIDADES})
            </p>
            <div className="chips-lista">
              {[...ESPECIALIDADES_SUGERIDAS, ...especialidadesPropias].map((especialidad) => {
                const elegida = perfil.especialidades.includes(especialidad)
                return (
                  <button
                    key={especialidad}
                    type="button"
                    className={elegida ? 'chip chip-activo' : 'chip'}
                    aria-pressed={elegida}
                    disabled={!elegida && perfil.especialidades.length >= MAXIMO_ESPECIALIDADES}
                    onClick={() => alternarEnLista('especialidades', especialidad)}
                  >
                    {elegida ? '✓ ' : ''}
                    {especialidad}
                  </button>
                )
              })}
            </div>
            <div className="mi-perfil-agregar">
              <input
                className="auth-input"
                type="text"
                placeholder="Otra especialidad (ej: Calistenia)"
                maxLength={40}
                value={especialidadNueva}
                onChange={(event) => setEspecialidadNueva(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && agregarEspecialidad(event)}
              />
              <button
                type="button"
                className="boton-secundario boton-chico"
                onClick={agregarEspecialidad}
                disabled={
                  !especialidadNueva.trim() || perfil.especialidades.length >= MAXIMO_ESPECIALIDADES
                }
              >
                Agregar
              </button>
            </div>
          </section>

          <section className="mi-perfil-seccion">
            <p className="seccion-etiqueta">Modalidad</p>
            <div className="chips-lista">
              {MODALIDADES.map((modalidad) => {
                const elegida = perfil.modalidades.includes(modalidad.id)
                return (
                  <button
                    key={modalidad.id}
                    type="button"
                    className={elegida ? 'chip chip-activo' : 'chip'}
                    aria-pressed={elegida}
                    onClick={() => alternarEnLista('modalidades', modalidad.id)}
                  >
                    {elegida ? '✓ ' : ''}
                    {modalidad.nombre}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="mi-perfil-seccion mi-perfil-campos">
            <label className="editor-campo">
              <span>Años de experiencia</span>
              <input
                className="auth-input"
                type="number"
                min="0"
                max="60"
                inputMode="numeric"
                placeholder="Ej: 5"
                value={perfil.experiencia_anios ?? ''}
                onChange={(event) => cambiar('experiencia_anios', event.target.value)}
              />
            </label>
            <label className="editor-campo">
              <span>Instagram (opcional)</span>
              <input
                className="auth-input"
                type="text"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="@tu.usuario"
                maxLength={60}
                value={perfil.instagram ?? ''}
                onChange={(event) => cambiar('instagram', event.target.value)}
              />
            </label>
          </section>

          <section className="mi-perfil-seccion">
            <label className="editor-campo">
              <span>Sobre vos</span>
              <textarea
                className="form-textarea mi-perfil-descripcion"
                placeholder="Tu formación, cómo trabajás, con quién te gusta entrenar, horarios…"
                maxLength={MAXIMO_DESCRIPCION_PROFE}
                value={perfil.descripcion ?? ''}
                onChange={(event) => cambiar('descripcion', event.target.value)}
              />
            </label>
            <p className="mi-perfil-contador">
              {(perfil.descripcion || '').length} / {MAXIMO_DESCRIPCION_PROFE}
            </p>
          </section>

          <section className="mi-perfil-seccion">
            <p className="seccion-etiqueta">¿Tomás alumnos nuevos?</p>
            <div className="chips-lista">
              <button
                type="button"
                className={perfil.acepta_alumnos ? 'chip chip-activo' : 'chip'}
                aria-pressed={perfil.acepta_alumnos}
                onClick={() => cambiar('acepta_alumnos', true)}
              >
                Sí
              </button>
              <button
                type="button"
                className={perfil.acepta_alumnos ? 'chip' : 'chip chip-activo'}
                aria-pressed={!perfil.acepta_alumnos}
                onClick={() => cambiar('acepta_alumnos', false)}
              >
                No, estoy completo
              </button>
            </div>
            {!perfil.acepta_alumnos && (
              <p className="profe-nota">
                Seguís apareciendo en la lista, pero nadie te puede mandar solicitudes ni elegirte
                al registrarse. Tus alumnos de ahora no cambian.
              </p>
            )}
          </section>

          {error && (
            <p className="auth-message" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="boton-principal" disabled={guardando || subiendoFoto}>
            {guardando ? 'Guardando…' : 'Guardar perfil'}
          </button>
        </form>

        <aside className="mi-perfil-vista">
          <p className="seccion-etiqueta">Así te ven los alumnos</p>
          <TarjetaProfe profe={vistaPrevia} />
        </aside>
      </div>
    </ProfeLayout>
  )
}
