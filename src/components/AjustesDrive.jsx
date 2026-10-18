import { useEffect, useState } from 'react'
import Esqueleto from './Esqueleto.jsx'
import { mostrarAviso } from '../services/avisos.js'
import {
  cargarAjustesDrive,
  esLinkDeScript,
  guardarAjustesDrive,
  probarDrive,
} from '../services/drive.js'

// Ajustes → Drive (solo el Admin): conecta DREY con la carpeta de Google
// Drive donde se guardan las evaluaciones de cada alumno (ver
// services/drive.js y herramientas/drive-evaluaciones.gs). Se pega el
// link del programa de Google y la clave; "Probar conexión" confirma que
// llega a la carpeta. Cada cambio queda en el Historial (sin la clave).
export default function AjustesDrive() {
  const [cargando, setCargando] = useState(true)
  const [guardados, setGuardados] = useState(null)
  const [urlScript, setUrlScript] = useState('')
  const [clave, setClave] = useState('')
  const [carpetaUrl, setCarpetaUrl] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [ocupado, setOcupado] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [prueba, setPrueba] = useState(null)

  useEffect(() => {
    cargarAjustesDrive().then((ajustes) => {
      setGuardados(ajustes)
      setUrlScript(ajustes.urlScript)
      setClave(ajustes.clave)
      setCarpetaUrl(ajustes.carpetaUrl)
      if (ajustes.error) {
        setMensaje(
          /ajustes_drive|does not exist|schema cache/i.test(ajustes.error.message || '')
            ? 'Falta instalar la actualización de la base (SQL 031).'
            : 'No pudimos cargar los ajustes. Revisá tu conexión.',
        )
      }
      setCargando(false)
    })
  }, [])

  const cambiado =
    guardados &&
    (urlScript.trim() !== guardados.urlScript ||
      clave.trim() !== guardados.clave ||
      carpetaUrl.trim() !== guardados.carpetaUrl)

  function revisar() {
    if (urlScript.trim() && !esLinkDeScript(urlScript)) {
      setMensaje(
        'El link tiene que empezar con https://script.google.com/macros/s/ y terminar en /exec',
      )
      return false
    }
    if (urlScript.trim() && !clave.trim()) {
      setMensaje('Falta la clave (la misma que está en el programa de Google).')
      return false
    }
    setMensaje('')
    return true
  }

  async function guardar(event) {
    event.preventDefault()
    if (!revisar()) return
    setOcupado('guardar')
    const error = await guardarAjustesDrive({ urlScript, clave, carpetaUrl })
    setOcupado('')
    if (error) {
      mostrarAviso(
        /ajustes_drive|does not exist|schema cache/i.test(error.message || '')
          ? 'Falta instalar la actualización de la base (SQL 031)'
          : 'No pudimos guardar. Probá de nuevo.',
        'error',
      )
      return
    }
    setGuardados({
      urlScript: urlScript.trim(),
      clave: clave.trim(),
      carpetaUrl: carpetaUrl.trim(),
    })
    mostrarAviso(urlScript.trim() ? 'Google Drive conectado' : 'Google Drive desconectado')
  }

  async function probar() {
    if (!urlScript.trim()) {
      setMensaje('Pegá primero el link del programa de Google.')
      return
    }
    if (!revisar()) return
    setOcupado('probar')
    setPrueba(null)
    const respuesta = await probarDrive({ urlScript, clave })
    setOcupado('')
    setPrueba(respuesta)
  }

  if (cargando) return <Esqueleto />

  return (
    <>
      <p className="profe-seccion-label">Evaluaciones en Google Drive</p>
      <p className="profe-nota">
        Al publicar una evaluación, DREY guarda el PDF en la carpeta de ese alumno dentro de tu
        carpeta de Drive (si no tiene, la crea con su nombre). Los pasos para conseguir el link y la
        clave están en el LEEME de esta actualización.
      </p>

      <form className="ajustes-tarjeta" onSubmit={guardar}>
        <label className="ajustes-campo">
          <span>Link del programa de Google (termina en /exec)</span>
          <input
            className="auth-input"
            type="url"
            value={urlScript}
            placeholder="https://script.google.com/macros/s/…/exec"
            onChange={(event) => {
              setUrlScript(event.target.value)
              setPrueba(null)
              setMensaje('')
            }}
          />
        </label>

        <label className="ajustes-campo">
          <span>Clave</span>
          <div className="ajustes-clave">
            <input
              className="auth-input"
              type={verClave ? 'text' : 'password'}
              value={clave}
              autoComplete="off"
              onChange={(event) => {
                setClave(event.target.value)
                setPrueba(null)
                setMensaje('')
              }}
            />
            <button
              type="button"
              className="boton-secundario boton-chico"
              onClick={() => setVerClave((actual) => !actual)}
            >
              {verClave ? 'Ocultar' : 'Ver'}
            </button>
          </div>
        </label>

        <label className="ajustes-campo">
          <span>Link de la carpeta de Drive (para tenerla a mano, opcional)</span>
          <input
            className="auth-input"
            type="url"
            value={carpetaUrl}
            placeholder="https://drive.google.com/drive/folders/…"
            onChange={(event) => setCarpetaUrl(event.target.value)}
          />
        </label>

        {mensaje && <p className="auth-message">{mensaje}</p>}

        {prueba && (
          <p className={prueba.ok ? 'ajustes-prueba-ok' : 'auth-message'}>
            {prueba.ok ? `✓ Conectado con la carpeta "${prueba.carpeta}".` : prueba.error}
          </p>
        )}

        <div className="evaluacion-acciones">
          <button
            type="button"
            className="boton-secundario boton-chico"
            onClick={probar}
            disabled={Boolean(ocupado)}
          >
            {ocupado === 'probar' ? 'Probando…' : 'Probar conexión'}
          </button>
          <button
            type="submit"
            className="boton-principal boton-chico"
            disabled={Boolean(ocupado) || !cambiado}
          >
            {ocupado === 'guardar' ? 'Guardando…' : 'Guardar'}
          </button>
          {guardados?.carpetaUrl && (
            <a
              className="boton-secundario boton-chico"
              href={guardados.carpetaUrl}
              target="_blank"
              rel="noreferrer"
            >
              Abrir la carpeta
            </a>
          )}
        </div>
      </form>
    </>
  )
}
