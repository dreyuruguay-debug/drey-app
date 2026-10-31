import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import LogoDrey from '../components/LogoDrey.jsx'
import PasosAsistente from '../components/PasosAsistente.jsx'
import DatosDeCuenta, {
  DATOS_VACIOS,
  revisarDatosDeCuenta,
  textoErrorRegistro,
} from '../components/registro/DatosDeCuenta.jsx'
import {
  buscarEspacioPorCodigo,
  codigoDisponible,
  codigoSugerido,
  normalizarCodigo,
} from '../services/equipo.js'
import { cargarPlanesDrey } from '../services/suscripcionDrey.js'
import { cargarConfiguracion, useConfiguracion } from '../services/configuracion.js'
import { formatearPrecio } from '../data/planes.js'
import { VERSION_TERMINOS } from '../data/versionLegal.js'
import { RUTA_INGRESAR } from '../data/rutas.js'

// Registro de PROFES ("/registro/profe") y de GIMNASIOS
// ("/registro/gimnasio"), supabase/sql/033. Profes y gimnasios entran
// solos (decisión D8): al Admin le llega un aviso y puede pausarlos.
//
//   1. Tus datos  (components/registro/DatosDeCuenta.jsx)
//   2. Tu espacio:
//        · profe:    su código (por defecto su nombre; la app revisa que
//                    esté libre) y, si trabaja en un gimnasio que ya usa
//                    DREY, el código de ese gimnasio (le llega la
//                    solicitud al dueño).
//        · gimnasio: nombre y código del gimnasio, y si también da clases.
//      Los términos (sin datos de salud: un profe no los carga).
//
// La cuenta nace con su espacio en prueba gratis (Ajustes → DREY). Si
// vino de un plan de la portada (?plan=profe-25), ese plan queda elegido
// para cuando termine la prueba. Todo viaja en los metadatos del registro
// ("tipo_cuenta" y compañía) y lo arma la base.
const PASOS = ['Tus datos', 'Tu espacio']

export default function RegistroProfe({ tipo = 'profe' }) {
  const esGimnasio = tipo === 'gimnasio'
  const [parametros] = useSearchParams()
  const config = useConfiguracion()
  const [paso, setPaso] = useState(0)
  const [datos, setDatos] = useState(DATOS_VACIOS)
  const [codigo, setCodigo] = useState('')
  const [codigoTocado, setCodigoTocado] = useState(false)
  const [estadoCodigo, setEstadoCodigo] = useState(null) // respuesta de codigoDisponible
  const [nombreGimnasio, setNombreGimnasio] = useState('')
  const [daClases, setDaClases] = useState(true)
  const [codigoGimnasio, setCodigoGimnasio] = useState('')
  const [gimnasioEncontrado, setGimnasioEncontrado] = useState(null)
  const [aceptaTerminos, setAceptaTerminos] = useState(false)
  const [plan, setPlan] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [revisando, setRevisando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [lista, setLista] = useState(false)

  useEffect(() => {
    cargarConfiguracion()
    const planId = parametros.get('plan')
    if (planId) {
      cargarPlanesDrey().then(({ planes }) => {
        setPlan(planes.find((item) => item.id === planId && item.activo) || null)
      })
    }
  }, [])

  // El código sugerido sigue al nombre (del profe o del gimnasio) hasta
  // que la persona lo cambia a mano.
  useEffect(() => {
    if (codigoTocado) return
    setCodigo(
      esGimnasio ? normalizarCodigo(nombreGimnasio).slice(0, 16) : codigoSugerido(datos.nombre),
    )
    setEstadoCodigo(null)
  }, [datos.nombre, nombreGimnasio, codigoTocado, esGimnasio])

  function cambiarDato(campo, valor) {
    setDatos((actual) => ({ ...actual, [campo]: valor }))
    setMensaje('')
  }

  async function revisarCodigo(texto = codigo) {
    const normal = normalizarCodigo(texto)
    if (!normal) {
      setEstadoCodigo(null)
      return null
    }
    const { datos: respuesta, error } = await codigoDisponible(normal)
    if (error) {
      setEstadoCodigo({ error: true })
      return null
    }
    setEstadoCodigo(respuesta)
    return respuesta
  }

  async function revisarGimnasio() {
    const normal = normalizarCodigo(codigoGimnasio)
    if (!normal) {
      setGimnasioEncontrado(null)
      return true
    }
    const { datos: encontrado } = await buscarEspacioPorCodigo(normal)
    if (!encontrado || encontrado.tipo !== 'gimnasio') {
      setGimnasioEncontrado({ noExiste: true })
      return false
    }
    setGimnasioEncontrado(encontrado)
    return true
  }

  async function siguiente(event) {
    event.preventDefault()
    setMensaje('')
    if (paso === 0) {
      const problema = revisarDatosDeCuenta(datos)
      if (problema) {
        setMensaje(problema)
        return
      }
      setPaso(1)
      window.scrollTo(0, 0)
      return
    }

    // Paso 2: revisar todo y crear la cuenta.
    if (esGimnasio && !nombreGimnasio.trim()) {
      setMensaje('Poné el nombre del gimnasio.')
      return
    }
    setRevisando(true)
    const respuesta = await revisarCodigo()
    const gimnasioOk = esGimnasio ? true : await revisarGimnasio()
    setRevisando(false)
    if (!respuesta?.disponible) {
      setMensaje(
        respuesta?.motivo === 'corto'
          ? 'El código tiene que tener al menos 4 letras o números.'
          : respuesta?.motivo === 'tomado'
            ? `Ese código ya está tomado. Probá con ${respuesta.sugerencia}.`
            : 'No pudimos revisar el código. Probá de nuevo.',
      )
      return
    }
    if (!gimnasioOk) {
      setMensaje('No encontramos un gimnasio con ese código. Revisalo o dejalo vacío.')
      return
    }
    if (!aceptaTerminos) {
      setMensaje('Tenés que aceptar los términos y la política de privacidad para continuar.')
      return
    }
    await crearCuenta(respuesta.codigo)
  }

  async function crearCuenta(codigoFinal) {
    setCreando(true)
    const { error } = await supabase.auth.signUp({
      email: datos.email.trim(),
      password: datos.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          tipo_cuenta: tipo,
          nombre: datos.nombre.trim(),
          apellido: datos.apellido.trim(),
          celular: datos.celular.trim(),
          terminos_version: VERSION_TERMINOS,
          plan_drey: plan?.id || null,
          // Profe: su código. Gimnasio: el del gimnasio (el suyo sale de
          // su nombre).
          codigo: esGimnasio
            ? codigoSugerido(datos.nombre) !== codigoFinal
              ? codigoSugerido(datos.nombre)
              : null
            : codigoFinal,
          codigo_gimnasio: !esGimnasio ? normalizarCodigo(codigoGimnasio) || null : null,
          gimnasio_nombre: esGimnasio ? nombreGimnasio.trim() : null,
          gimnasio_codigo: esGimnasio ? codigoFinal : null,
          da_clases: esGimnasio ? daClases : null,
        },
      },
    })
    setCreando(false)
    if (error) {
      setMensaje(textoErrorRegistro(error))
      return
    }
    setLista(true)
    window.scrollTo(0, 0)
  }

  const prueba = config.prueba || { activa: true, dias: 14, cupos: 3 }

  if (lista) {
    return (
      <main className="auth-screen">
        <LogoDrey />
        <p className="registro-gracias-titulo">¡Cuenta creada!</p>
        <p className="registro-gracias-texto">
          {prueba.activa
            ? `Empezás con ${prueba.dias} días de prueba gratis para hasta ${prueba.cupos} alumnos. Después elegís un plan desde "Suscripción DREY".`
            : 'Para habilitar alumnos, elegí un plan desde "Suscripción DREY" cuando entres.'}
        </p>
        <p className="registro-gracias-texto">
          {esGimnasio ? 'El código del gimnasio es ' : 'Tu código es '}
          <strong>{normalizarCodigo(codigo)}</strong>
          {esGimnasio
            ? ': pasáselo a tus alumnos y a tus profes para que se sumen.'
            : ': pasáselo a tus alumnos para que se registren con vos.'}
          {gimnasioEncontrado?.nombre &&
            ` Le avisamos a ${gimnasioEncontrado.nombre} que querés sumarte.`}
        </p>
        <p className="registro-gracias-texto">
          Te mandamos un email para confirmar tu cuenta. Revisá también la carpeta de spam.
        </p>
        <Link to={RUTA_INGRESAR} className="pill-button registro-gracias-boton">
          Iniciar sesión
        </Link>
      </main>
    )
  }

  return (
    <main className="registro-screen">
      <LogoDrey />
      <PasosAsistente pasos={PASOS} actual={paso} etiqueta="Pasos del registro" />

      <form className="registro-form" onSubmit={siguiente}>
        {paso === 0 && (
          <>
            <p className="form-section-label">
              {esGimnasio ? 'Tus datos (dueño del gimnasio)' : 'Tus datos'}
            </p>
            <DatosDeCuenta datos={datos} onCambiar={cambiarDato} />
          </>
        )}

        {paso === 1 && (
          <>
            {esGimnasio && (
              <>
                <p className="form-section-label">Tu gimnasio</p>
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Nombre del gimnasio"
                  maxLength={80}
                  value={nombreGimnasio}
                  onChange={(event) => setNombreGimnasio(event.target.value)}
                />
                <label className="form-checkbox-row">
                  <input
                    type="checkbox"
                    checked={daClases}
                    onChange={(event) => setDaClases(event.target.checked)}
                  />
                  <span>También doy clases en el gimnasio (puedo tener alumnos propios ahí)</span>
                </label>
              </>
            )}

            <p className="form-section-label">{esGimnasio ? 'Código del gimnasio' : 'Tu código'}</p>
            <p className="registro-edad">
              {esGimnasio
                ? 'Tus alumnos y tus profes lo usan para sumarse al gimnasio.'
                : 'Tus alumnos lo usan para registrarse con vos.'}{' '}
              Mínimo 4 letras o números, sin espacios.
            </p>
            <input
              className="auth-input"
              type="text"
              placeholder={esGimnasio ? 'Ej. FITCENTER' : 'Ej. FACU'}
              maxLength={20}
              value={codigo}
              onChange={(event) => {
                setCodigoTocado(true)
                setCodigo(normalizarCodigo(event.target.value))
                setEstadoCodigo(null)
              }}
              onBlur={() => revisarCodigo()}
            />
            {estadoCodigo && (
              <p
                className={
                  estadoCodigo.disponible ? 'registro-edad registro-codigo-ok' : 'registro-edad'
                }
              >
                {estadoCodigo.error
                  ? 'No pudimos revisar el código.'
                  : estadoCodigo.disponible
                    ? `✓ ${estadoCodigo.codigo} está libre`
                    : estadoCodigo.motivo === 'corto'
                      ? 'Tiene que tener al menos 4 letras o números.'
                      : `Ya está tomado. Probá con ${estadoCodigo.sugerencia}.`}
              </p>
            )}

            {!esGimnasio && (
              <>
                <p className="form-section-label">¿Trabajás en un gimnasio que usa DREY?</p>
                <input
                  className="auth-input"
                  type="text"
                  placeholder="Código del gimnasio (opcional)"
                  maxLength={20}
                  value={codigoGimnasio}
                  onChange={(event) => {
                    setCodigoGimnasio(normalizarCodigo(event.target.value))
                    setGimnasioEncontrado(null)
                  }}
                  onBlur={revisarGimnasio}
                />
                {gimnasioEncontrado && (
                  <p
                    className={
                      gimnasioEncontrado.noExiste
                        ? 'registro-edad'
                        : 'registro-edad registro-codigo-ok'
                    }
                  >
                    {gimnasioEncontrado.noExiste
                      ? 'No encontramos un gimnasio con ese código.'
                      : `✓ Le vamos a pedir a ${gimnasioEncontrado.nombre} que te sume a su equipo.`}
                  </p>
                )}
              </>
            )}

            {plan && (
              <div className="suscripcion-plan-card">
                <p className="suscripcion-plan-nombre">{plan.nombre}</p>
                <p className="suscripcion-plan-precio">
                  Hasta {plan.cupos} alumnos · {formatearPrecio(plan.precioMensual)} por mes
                </p>
                <p className="suscripcion-vencimiento">
                  {prueba.activa
                    ? `Primero ${prueba.dias} días gratis; el plan empieza cuando lo pagás.`
                    : 'El plan empieza cuando lo pagás.'}
                </p>
              </div>
            )}
            {!plan && prueba.activa && (
              <p className="registro-edad">
                Empezás con {prueba.dias} días de prueba gratis para hasta {prueba.cupos} alumnos,
                sin tarjeta.
              </p>
            )}

            <label className="form-checkbox-row">
              <input
                type="checkbox"
                checked={aceptaTerminos}
                onChange={(event) => setAceptaTerminos(event.target.checked)}
              />
              <span>
                Leí y acepto los{' '}
                <Link to="/terminos" target="_blank" rel="noopener">
                  términos y condiciones
                </Link>{' '}
                (incluida la parte para profes y gimnasios) y la{' '}
                <Link to="/privacidad" target="_blank" rel="noopener">
                  política de privacidad
                </Link>
                .
              </span>
            </label>
          </>
        )}

        {mensaje && <p className="auth-message">{mensaje}</p>}

        <button type="submit" className="auth-submit" disabled={revisando || creando}>
          {paso === 0
            ? 'Siguiente'
            : creando
              ? 'Creando cuenta…'
              : revisando
                ? 'Revisando…'
                : 'Crear mi cuenta'}
        </button>
        {paso > 0 && (
          <button
            type="button"
            className="registro-boton-secundario"
            disabled={creando}
            onClick={() => {
              setMensaje('')
              setPaso(0)
            }}
          >
            ← Atrás
          </button>
        )}
      </form>

      <Link to="/registro" className="auth-switch">
        {esGimnasio
          ? '¿Sos profe o alumno? Elegí otro tipo de cuenta'
          : 'Elegí otro tipo de cuenta'}
      </Link>
      <Link to={RUTA_INGRESAR} className="auth-switch">
        Ya tengo cuenta
      </Link>
    </main>
  )
}
