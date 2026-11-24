import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import { cargarProfesDisponibles, obtenerOpcionesDeProfe } from '../services/profes.js'
import {
  buscarEspacioPorCodigo,
  cargarEspaciosParaAlumnos,
  normalizarCodigo,
} from '../services/equipo.js'
import { textoExperiencia, textoModalidades } from '../data/especialidades.js'
import DatosDeCuenta, {
  DATOS_VACIOS,
  revisarDatosDeCuenta,
  textoErrorRegistro,
} from '../components/registro/DatosDeCuenta.jsx'
import DatosDePago from '../components/DatosDePago.jsx'
import PasosAsistente from '../components/PasosAsistente.jsx'
import CasillasConsentimiento from '../components/CasillasConsentimiento.jsx'
import { formatearPrecio, listaDePlanes } from '../data/planes.js'
import { linkDePago } from '../data/pagos.js'
import { VERSION_TERMINOS } from '../data/versionLegal.js'
import { cargarConfiguracion, useConfiguracion } from '../services/configuracion.js'
import { validarCodigo } from '../services/pagos.js'
import { cargarCobroDeEspacio, cargarPlanesDeEspacio } from '../services/cobroEspacio.js'
import { calcularEdad } from '../utils/fechas.js'
import Esqueleto from '../components/Esqueleto.jsx'
import { RUTA_INGRESAR } from '../data/rutas.js'
import LogoDrey from '../components/LogoDrey.jsx'

// Registro del ALUMNO ("/registro/alumno"; "/registro" es el elegidor
// de tipo de cuenta, pages/RegistroElegir.jsx). 4 pasos, en este orden:
//   1. Tus datos      (los de components/registro/DatosDeCuenta.jsx, más
//                      fecha de nacimiento, peso, objetivo, lesiones y las
//                      dos casillas de consentimiento: términos/privacidad y
//                      datos de salud, Ley 18.331)
//   2. Tu profe       (el profe o gimnasio con el que entrena: de la lista
//                      o con el código que le pasaron, supabase/sql/033;
//                      "/registro/alumno?espacio=FITCENTER" ya lo deja elegido)
//   3. Tu plan        (uno de los planes DE ESE PROFE O GIMNASIO + código
//                      de descuento, que se revisa en la base antes de
//                      seguir; supabase/sql/034)
//   4. Pago           (a quién le paga, el link de Mercado Pago si hay, y
//                      "Crear mi cuenta" / "Ya pagué con Mercado Pago"). La
//                      cuenta bancaria NO se muestra acá: sin sesión la base
//                      no la da (supabase/sql/039); la ve en Suscripción.
//
// Recién en el paso 4 se crea la cuenta. Queda "pendiente" hasta que
// paga (por transferencia o con el link de Mercado Pago) y su profe o
// gimnasio la habilita.
//
// Los planes y precios salen de la base de datos (planes_de_espacio, solo
// los visibles del espacio elegido). Sin el SQL 034, o si no eligió
// espacio, se muestran los de siempre (tabla "planes").
//
// Todos los datos viajan en los metadatos del usuario de Supabase y la
// base los copia sola a la tabla "perfiles" (triggers handle_new_user,
// asignar_profe_al_registrarse y registro_por_tipo, ver supabase/sql/007
// y 033). El espacio elegido viaja como "espacio_codigo".
const PASOS = ['Tus datos', 'Tu profe', 'Tu plan', 'Pago']
const PASO_PROFE = 1
const PASO_PLAN = 2

export default function Registro() {
  const [paso, setPaso] = useState(0)
  const [parametros] = useSearchParams()

  // Paso 1
  const [datos, setDatos] = useState(DATOS_VACIOS)
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [peso, setPeso] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [lesiones, setLesiones] = useState('')
  const [aceptaTerminos, setAceptaTerminos] = useState(false)
  const [consienteSalud, setConsienteSalud] = useState(false)

  // Paso 2 (si viene de "Empezar" en un plan de la página de inicio, ese
  // plan ya queda elegido: /registro?plan=seguimiento. Si ese plan no
  // existe o está oculto, no cuenta: el paso 2 pide elegir uno)
  const [planId, setPlanId] = useState(() => parametros.get('plan') || '')
  const [codigoDescuento, setCodigoDescuento] = useState('')
  const [codigoValidado, setCodigoValidado] = useState(null) // respuesta de validarCodigo
  const [revisando, setRevisando] = useState(false)

  // Paso "Tu profe": la lista de profes y gimnasios (espacios, SQL 033).
  // Sin ese SQL se usa la lista de antes (opciones_de_profe) y "eleccion"
  // lleva { tipo, id } en vez de { codigo }.
  const [opcionesProfe, setOpcionesProfe] = useState([])
  const [conEspacios, setConEspacios] = useState(true)
  const [cargandoOpciones, setCargandoOpciones] = useState(true)
  // { codigo, tipo, nombre } (o { tipo, id } con la lista de antes)
  const [eleccion, setEleccion] = useState(null)
  const [codigoEspacio, setCodigoEspacio] = useState(() => parametros.get('espacio') || '')
  const [buscandoCodigo, setBuscandoCodigo] = useState(false)
  const [mensajeCodigo, setMensajeCodigo] = useState('')
  // Perfil público de cada profe (especialidades, modalidad), por id.
  const [perfilesProfe, setPerfilesProfe] = useState({})

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState(null) // { avisoPago: boolean }

  // Planes y datos de cobro del espacio elegido (SQL 034). null /
  // undefined = la base no los tiene: se usan los de siempre.
  const [planesEspacio, setPlanesEspacio] = useState(null)
  const [cobroEspacio, setCobroEspacio] = useState(undefined)
  const [cargandoPlanes, setCargandoPlanes] = useState(false)

  // Planes de respaldo (Ajustes del Admin).
  useConfiguracion()
  const planes = planesEspacio ?? listaDePlanes({ soloVisibles: true })

  const edad = calcularEdad(fechaNacimiento)
  const plan = planes.find((opcion) => opcion.id === planId)
  // Con link de Mercado Pago puede pagar antes de crear la cuenta.
  const puedePagarYa = Boolean(linkDePago(planId, cobroEspacio))

  useEffect(() => {
    cargarOpcionesDeProfe()
    cargarConfiguracion()
  }, [])

  // Cada vez que elige otro profe o gimnasio: sus planes y sus datos de
  // cobro. Si el plan elegido no es de ese espacio, se borra.
  const codigoElegido = eleccion?.codigo || ''
  useEffect(() => {
    if (!codigoElegido) {
      setPlanesEspacio(null)
      setCobroEspacio(undefined)
      return undefined
    }
    let vigente = true
    setCargandoPlanes(true)
    Promise.all([cargarPlanesDeEspacio(codigoElegido), cargarCobroDeEspacio(codigoElegido)]).then(
      ([{ planes: lista, error }, { cobro, error: errorCobro }]) => {
        if (!vigente) return
        setCargandoPlanes(false)
        setPlanesEspacio(error ? null : lista)
        setCobroEspacio(errorCobro ? undefined : cobro || undefined)
        if (!error) {
          setPlanId((actual) => (lista.some((opcion) => opcion.id === actual) ? actual : ''))
          setCodigoValidado(null)
        }
      },
    )
    return () => {
      vigente = false
    }
  }, [codigoElegido])

  async function cargarOpcionesDeProfe() {
    setCargandoOpciones(true)
    const [{ datos: espacios, error }, { profes }] = await Promise.all([
      cargarEspaciosParaAlumnos(),
      cargarProfesDisponibles(),
    ])
    setPerfilesProfe(Object.fromEntries(profes.map((profe) => [profe.id, profe])))
    if (error) {
      // La base todavía no tiene el SQL 033: la lista de antes.
      const { opciones } = await obtenerOpcionesDeProfe()
      setConEspacios(false)
      setOpcionesProfe(opciones)
      if (opciones.length === 1) setEleccion({ tipo: opciones[0].tipo, id: opciones[0].id })
      setCargandoOpciones(false)
      return
    }
    const lista = espacios || []
    setOpcionesProfe(lista)
    // Vino con un código (link de su profe o gimnasio) o hay una sola
    // opción: queda elegida.
    const codigoInicial = normalizarCodigo(parametros.get('espacio'))
    const inicial =
      lista.find((opcion) => opcion.codigo === codigoInicial) ||
      (lista.length === 1 ? lista[0] : null)
    if (inicial) {
      setEleccion({ codigo: inicial.codigo, tipo: inicial.tipo, nombre: inicial.nombre })
    } else if (codigoInicial) {
      buscarCodigo(codigoInicial)
    }
    setCargandoOpciones(false)
  }

  // "¿Te pasaron un código?": busca el profe o gimnasio y lo deja elegido.
  async function buscarCodigo(texto = codigoEspacio) {
    const codigo = normalizarCodigo(texto)
    setMensajeCodigo('')
    if (codigo.length < 4) {
      setMensajeCodigo('El código tiene al menos 4 letras o números.')
      return
    }
    setBuscandoCodigo(true)
    const { datos: encontrado } = await buscarEspacioPorCodigo(codigo)
    setBuscandoCodigo(false)
    if (!encontrado) {
      setMensajeCodigo('No encontramos ese código. Revisalo con tu profe.')
      return
    }
    if (!encontrado.toma_alumnos) {
      setMensajeCodigo(`${encontrado.nombre} no está tomando alumnos por ahora.`)
      return
    }
    setEleccion({ codigo: encontrado.codigo, tipo: encontrado.tipo, nombre: encontrado.nombre })
    setMensajeCodigo(`✓ ${encontrado.nombre}`)
  }

  // Revisa que el paso actual esté completo. Devuelve el mensaje de
  // error a mostrar, o '' si se puede avanzar.
  function validarPaso(numeroPaso) {
    if (numeroPaso === 0) {
      if (!fechaNacimiento || !objetivo) return 'Completá todos los campos obligatorios.'
      const problema = revisarDatosDeCuenta(datos)
      if (problema) return problema
      if (!aceptaTerminos) {
        return 'Tenés que aceptar los términos y la política de privacidad para continuar.'
      }
      if (!consienteSalud) {
        return 'Necesitamos tu autorización para usar tus datos de salud: sin ellos tu profe no puede armarte la rutina.'
      }
    }
    if (numeroPaso === PASO_PLAN && cargandoPlanes) return 'Esperá un segundo: cargando los planes.'
    // Si su profe todavía no cargó planes, sigue sin plan (se lo pone el profe).
    if (numeroPaso === PASO_PLAN && !plan && planes.length > 0) {
      return 'Elegí un plan para continuar.'
    }
    if (numeroPaso === PASO_PROFE && opcionesProfe.length > 0 && !eleccion) {
      return 'Elegí tu profe o gimnasio (o escribí su código) para continuar.'
    }
    return ''
  }

  async function irAlSiguiente(event) {
    event.preventDefault()
    if (revisando) return
    const pasoActual = paso
    let error = validarPaso(pasoActual)

    // El código de descuento se revisa en la base antes de pasar al pago.
    if (!error && pasoActual === PASO_PLAN && plan && codigoDescuento.trim()) {
      setRevisando(true)
      const validado = await validarCodigo(codigoDescuento, planId)
      setRevisando(false)
      setCodigoValidado(validado)
      if (!validado?.valido) {
        error = validado?.mensaje || 'Ese código no es válido. Corregilo o borralo para seguir.'
      }
    }

    setMessage(error)
    if (!error) {
      // Paso fijo (no "el actual + 1"): un doble toque no saltea pasos.
      setPaso(pasoActual + 1)
      window.scrollTo(0, 0)
    }
  }

  function irAlAnterior() {
    setMessage('')
    setPaso((actual) => actual - 1)
    window.scrollTo(0, 0)
  }

  async function crearCuenta(avisoPago) {
    setMessage('')
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: datos.email.trim(),
      password: datos.password,
      options: {
        // El link del mail de confirmación vuelve a la app (y entra solo).
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          tipo_cuenta: 'alumno',
          nombre: datos.nombre.trim(),
          apellido: datos.apellido.trim(),
          fecha_nacimiento: fechaNacimiento,
          peso: peso ? Number(peso) : null,
          celular: datos.celular.trim(),
          objetivo,
          lesiones: lesiones || null,
          plan: plan ? planId : null,
          codigo_descuento: plan && codigoValidado?.valido ? codigoValidado.codigo : null,
          estado: 'pendiente',
          espacio_codigo: eleccion?.codigo || null,
          profe_id: !eleccion?.codigo && eleccion?.tipo === 'profe' ? eleccion.id : null,
          gimnasio_id: !eleccion?.codigo && eleccion?.tipo === 'gimnasio' ? eleccion.id : null,
          aviso_pago: avisoPago,
          terminos_version: VERSION_TERMINOS,
          consentimiento_salud: consienteSalud,
        },
      },
    })
    setLoading(false)

    if (error) {
      setMessage(textoErrorRegistro(error))
      return
    }

    setResultado({ avisoPago })
    window.scrollTo(0, 0)
  }

  if (resultado) {
    return (
      <main className="auth-screen">
        <LogoDrey />
        <p className="registro-gracias-titulo">
          {resultado.avisoPago ? 'Pago avisado' : '¡Cuenta creada!'}
        </p>
        <p className="registro-gracias-texto">
          {resultado.avisoPago
            ? 'Avisaste tu pago. Esperando autorización del profesor.'
            : 'Tu cuenta queda pendiente hasta que pagues. Confirmá tu email y entrá a la app: en Suscripción vas a ver los datos para pagar y, cuando pagues, tocás "Ya pagué".'}
        </p>
        <p className="registro-gracias-texto">
          Te mandamos un email para confirmar tu cuenta. Revisá también la carpeta de spam.
        </p>
        <Link to={RUTA_INGRESAR} className="pill-button registro-gracias-boton">
          Volver a iniciar sesión
        </Link>
      </main>
    )
  }

  return (
    <main className="registro-screen">
      <LogoDrey />

      <PasosAsistente pasos={PASOS} actual={paso} etiqueta="Pasos del registro" />

      <form className="registro-form" onSubmit={irAlSiguiente}>
        {paso === 0 && (
          <>
            <p className="form-section-label">Tus datos</p>

            <DatosDeCuenta
              datos={datos}
              onCambiar={(campo, valor) => setDatos((actual) => ({ ...actual, [campo]: valor }))}
              sinCelular
            />

            <div>
              <input
                className="auth-input"
                type="date"
                value={fechaNacimiento}
                onChange={(event) => setFechaNacimiento(event.target.value)}
                aria-label="Fecha de nacimiento"
              />
              {edad !== null && <p className="registro-edad">Edad: {edad} años</p>}
            </div>

            <div className="form-row">
              <input
                className="auth-input"
                type="number"
                step="0.1"
                placeholder="Peso en kg (opcional)"
                value={peso}
                onChange={(event) => setPeso(event.target.value)}
              />
              <input
                className="auth-input"
                type="tel"
                placeholder="Celular"
                value={datos.celular}
                onChange={(event) =>
                  setDatos((actual) => ({ ...actual, celular: event.target.value }))
                }
              />
            </div>

            <p className="form-section-label">Tu entrenamiento</p>

            <input
              className="auth-input"
              type="text"
              placeholder="Objetivo (por ejemplo: Recomposición corporal)"
              value={objetivo}
              onChange={(event) => setObjetivo(event.target.value)}
            />

            <textarea
              className="form-textarea"
              placeholder="Lesiones y/o limitaciones (opcional)"
              value={lesiones}
              onChange={(event) => setLesiones(event.target.value)}
            />

            <CasillasConsentimiento
              terminos={aceptaTerminos}
              salud={consienteSalud}
              onTerminos={setAceptaTerminos}
              onSalud={setConsienteSalud}
            />
          </>
        )}

        {paso === PASO_PROFE && (
          <>
            {/* Lo más común: el profe o el gimnasio le pasó su código.
                Va primero y destacado; la lista queda abajo. */}
            <div className="registro-codigo-caja">
              <p className="registro-codigo-caja-titulo">
                ¿Tu profe o gimnasio te pasó un código?
              </p>
              <p className="registro-codigo-caja-ayuda">
                Escribilo acá y te anotamos directo con él.
              </p>
              <div className="registro-codigo-espacio">
                <input
                  className="auth-input"
                  type="text"
                  aria-label="Código de tu profe o gimnasio"
                  placeholder="Ej. FITCENTER"
                  value={codigoEspacio}
                  onChange={(event) => {
                    setCodigoEspacio(event.target.value.toUpperCase())
                    setMensajeCodigo('')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      buscarCodigo()
                    }
                  }}
                />
                {conEspacios && (
                  <button
                    type="button"
                    className="boton-secundario boton-chico"
                    disabled={buscandoCodigo || !codigoEspacio.trim()}
                    onClick={() => buscarCodigo()}
                  >
                    {buscandoCodigo ? 'Buscando…' : 'Buscar'}
                  </button>
                )}
              </div>
              {mensajeCodigo && (
                <p
                  className={
                    mensajeCodigo.startsWith('✓')
                      ? 'registro-edad registro-codigo-ok'
                      : 'registro-edad'
                  }
                >
                  {mensajeCodigo}
                </p>
              )}
            </div>

            <p className="registro-separador">o elegilo de la lista</p>

            {cargandoOpciones ? (
              <Esqueleto tipo="linea" />
            ) : opcionesProfe.length === 0 ? (
              <p className="registro-edad">
                Todavía no hay profes para elegir. Podés seguir: el profe te asigna después.
              </p>
            ) : (
              <div className="plan-opciones">
                {opcionesProfe.map((opcion) => {
                  const activa = conEspacios
                    ? eleccion?.codigo === opcion.codigo
                    : eleccion?.tipo === opcion.tipo && eleccion?.id === opcion.id
                  const idProfe = conEspacios ? opcion.profe_id : opcion.id
                  return (
                    <button
                      key={conEspacios ? opcion.codigo : `${opcion.tipo}-${opcion.id}`}
                      type="button"
                      className={activa ? 'plan-card plan-card-activo' : 'plan-card'}
                      onClick={() => {
                        setMensajeCodigo('')
                        setEleccion(
                          conEspacios
                            ? { codigo: opcion.codigo, tipo: opcion.tipo, nombre: opcion.nombre }
                            : { tipo: opcion.tipo, id: opcion.id },
                        )
                      }}
                    >
                      <span className="plan-card-descripcion">
                        {opcion.tipo === 'profe' ? 'Profe' : 'Gimnasio'}
                      </span>
                      <span className="plan-card-nombre">{opcion.nombre}</span>
                      {opcion.detalle && (
                        <span className="plan-card-precio-siguiente">{opcion.detalle}</span>
                      )}
                      {opcion.tipo === 'profe' && textoPerfil(perfilesProfe[idProfe]) && (
                        <span className="plan-card-precio-siguiente">
                          {textoPerfil(perfilesProfe[idProfe])}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}

        {paso === PASO_PLAN && (
          <>
            <p className="form-section-label">
              Elegí tu plan{eleccion?.nombre ? ` con ${eleccion.nombre}` : ''}
            </p>

            {cargandoPlanes ? (
              <Esqueleto tipo="linea" />
            ) : planes.length === 0 ? (
              <p className="registro-edad">
                {eleccion?.nombre || 'Tu profe'} todavía no cargó sus planes. Podés seguir: te
                asigna el plan cuando habilite tu cuenta.
              </p>
            ) : null}

            <div className="plan-opciones">
              {planes.map((opcion) => (
                <button
                  key={opcion.id}
                  type="button"
                  className={opcion.id === planId ? 'plan-card plan-card-activo' : 'plan-card'}
                  onClick={() => setPlanId(opcion.id)}
                >
                  <span className="plan-card-nombre">{opcion.nombre}</span>
                  <span className="plan-card-descripcion">{opcion.descripcion}</span>
                  <span className="plan-card-precio">
                    {formatearPrecio(opcion.precioPrimerMes)} el primer mes
                  </span>
                  <span className="plan-card-precio-siguiente">
                    Desde el 2.º mes: {formatearPrecio(opcion.precioDesdeSegundoMes)}
                  </span>
                </button>
              ))}
            </div>

            {planes.length > 0 && (
              <input
                className="auth-input"
                type="text"
                placeholder="Código de descuento (opcional)"
                value={codigoDescuento}
                onChange={(event) => {
                  setCodigoDescuento(event.target.value.toUpperCase())
                  setCodigoValidado(null)
                }}
              />
            )}
            {codigoValidado?.valido && (
              <p className="registro-edad registro-codigo-ok">
                ✓ Código {codigoValidado.codigo}: {textoDescuento(codigoValidado)}
              </p>
            )}
          </>
        )}

        {paso === 3 && (
          <>
            <p className="form-section-label">Pago</p>

            {plan && (
              <div className="suscripcion-plan-card">
                <p className="suscripcion-plan-nombre">{plan.nombre}</p>
                <p className="suscripcion-plan-precio">
                  {formatearPrecio(precioConDescuento(plan.precioPrimerMes, codigoValidado))} el
                  primer mes
                </p>
                {codigoValidado?.valido && (
                  <p className="suscripcion-vencimiento">
                    Con el código {codigoValidado.codigo} (antes{' '}
                    {formatearPrecio(plan.precioPrimerMes)}).
                  </p>
                )}
              </div>
            )}

            <DatosDePago planId={planId} cobro={cobroEspacio} sinCuenta />
            <p className="registro-edad">
              {puedePagarYa
                ? 'Si ya pagaste con Mercado Pago, tocá "Ya pagué con Mercado Pago". Si no, creá tu cuenta y pagá cuando quieras desde Suscripción.'
                : 'Creá tu cuenta y, cuando pagues, avisalo desde la pantalla Suscripción.'}
            </p>
          </>
        )}

        {message && <p className="auth-message">{message}</p>}

        {paso < PASOS.length - 1 ? (
          <button type="submit" className="auth-submit" disabled={revisando}>
            {revisando ? 'Revisando el código…' : 'Siguiente'}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="auth-submit"
              disabled={loading}
              onClick={() => crearCuenta(false)}
            >
              {loading ? 'Creando cuenta…' : 'Crear mi cuenta'}
            </button>
            {puedePagarYa && (
              <button
                type="button"
                className="registro-boton-secundario"
                disabled={loading}
                onClick={() => crearCuenta(true)}
              >
                Ya pagué con Mercado Pago
              </button>
            )}
          </>
        )}

        {paso > 0 && (
          <button
            type="button"
            className="registro-boton-secundario"
            disabled={loading}
            onClick={irAlAnterior}
          >
            ← Atrás
          </button>
        )}
      </form>

      <Link to={RUTA_INGRESAR} className="auth-switch">
        Ya tengo cuenta
      </Link>
    </main>
  )
}

// Precio del primer mes con el descuento del código (el mismo cálculo que
// hace la base en calcular_precio, supabase/sql/014).
function precioConDescuento(precio, codigo) {
  if (!codigo?.valido) return precio
  const descuento =
    (Number(codigo.monto_fijo) || 0) + Math.round((precio * (Number(codigo.porcentaje) || 0)) / 100)
  return Math.max(0, precio - Math.min(precio, descuento))
}

function textoDescuento(codigo) {
  const partes = []
  if (codigo.porcentaje) partes.push(`${Number(codigo.porcentaje)}% de descuento`)
  if (codigo.monto_fijo) partes.push(`${formatearPrecio(codigo.monto_fijo)} de descuento`)
  if (codigo.solo_primer_mes) partes.push('el primer mes')
  return partes.join(' ') || codigo.descripcion || 'aplicado'
}

// Una línea con lo principal del perfil del profe: especialidades,
// modalidad y experiencia (supabase/sql/026). '' si no lo completó.
function textoPerfil(profe) {
  if (!profe) return ''
  return [
    profe.especialidades?.slice(0, 3).join(', '),
    textoModalidades(profe.modalidades),
    textoExperiencia(profe.experiencia_anios),
  ]
    .filter(Boolean)
    .join(' · ')
}
