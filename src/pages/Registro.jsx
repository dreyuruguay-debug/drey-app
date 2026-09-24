import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient.js'
import { obtenerOpcionesDeProfe } from '../services/profes.js'
import EyeIcon from '../components/EyeIcon.jsx'
import DatosDePago from '../components/DatosDePago.jsx'
import { PLANES, obtenerPlan, formatearPrecio } from '../data/planes.js'
import { calcularEdad } from '../utils/fechas.js'

// Registro en 4 pasos, en este orden:
//   1. Tus datos      (datos personales, objetivo, lesiones, privacidad)
//   2. Tu plan        (uno de los 3 planes + código de descuento)
//   3. Tu profe       (profe o gimnasio al que se asocia)
//   4. Pago           (cómo pagar y botón "Ya pagué")
//
// Recién en el paso 4 se crea la cuenta. Queda "pendiente" hasta que
// el profe elegido la habilita desde "Cuentas y pagos".
//
// Todos los datos viajan en los metadatos del usuario de Supabase y la
// base los copia sola a la tabla "perfiles" (triggers handle_new_user y
// asignar_profe_al_registrarse, ver supabase/sql/007).
const PASOS = ['Tus datos', 'Tu plan', 'Tu profe', 'Pago']

export default function Registro() {
  const [paso, setPaso] = useState(0)

  // Paso 1
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmarPassword, setConfirmarPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmarPassword, setShowConfirmarPassword] = useState(false)
  const [fechaNacimiento, setFechaNacimiento] = useState('')
  const [peso, setPeso] = useState('')
  const [celular, setCelular] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [lesiones, setLesiones] = useState('')
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false)

  // Paso 2
  const [planId, setPlanId] = useState('')
  const [codigoDescuento, setCodigoDescuento] = useState('')

  // Paso 3
  const [opcionesProfe, setOpcionesProfe] = useState([])
  const [cargandoOpciones, setCargandoOpciones] = useState(true)
  const [eleccion, setEleccion] = useState(null) // { tipo: 'profe' | 'gimnasio', id }

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState(null) // { avisoPago: boolean }

  const edad = calcularEdad(fechaNacimiento)
  const plan = obtenerPlan(planId)

  useEffect(() => {
    cargarOpcionesDeProfe()
  }, [])

  async function cargarOpcionesDeProfe() {
    setCargandoOpciones(true)
    const { opciones } = await obtenerOpcionesDeProfe()
    setOpcionesProfe(opciones)
    // Si hay una sola opción, se deja elegida para ahorrar un toque.
    if (opciones.length === 1) {
      setEleccion({ tipo: opciones[0].tipo, id: opciones[0].id })
    }
    setCargandoOpciones(false)
  }

  // Revisa que el paso actual esté completo. Devuelve el mensaje de
  // error a mostrar, o '' si se puede avanzar.
  function validarPaso(numeroPaso) {
    if (numeroPaso === 0) {
      if (
        !nombre ||
        !apellido ||
        !email ||
        !password ||
        !fechaNacimiento ||
        !celular ||
        !objetivo
      ) {
        return 'Completá todos los campos obligatorios.'
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) return 'Revisá el email: parece que tiene un error.'
      if (password.length < 6) return 'La contraseña tiene que tener al menos 6 caracteres.'
      if (password !== confirmarPassword) return 'Las contraseñas no coinciden.'
      if (!aceptaPrivacidad) return 'Tenés que aceptar la política de privacidad para continuar.'
    }
    if (numeroPaso === 1 && !planId) return 'Elegí un plan para continuar.'
    if (numeroPaso === 2 && opcionesProfe.length > 0 && !eleccion) {
      return 'Elegí tu profe o gimnasio para continuar.'
    }
    return ''
  }

  function irAlSiguiente(event) {
    event.preventDefault()
    const error = validarPaso(paso)
    setMessage(error)
    if (!error) {
      setPaso((actual) => actual + 1)
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
      email,
      password,
      options: {
        data: {
          nombre,
          apellido,
          fecha_nacimiento: fechaNacimiento,
          peso: peso ? Number(peso) : null,
          celular,
          objetivo,
          lesiones: lesiones || null,
          plan: planId,
          codigo_descuento: codigoDescuento || null,
          estado: 'pendiente',
          profe_id: eleccion?.tipo === 'profe' ? eleccion.id : null,
          gimnasio_id: eleccion?.tipo === 'gimnasio' ? eleccion.id : null,
          aviso_pago: avisoPago,
        },
      },
    })
    setLoading(false)

    if (error) {
      setMessage(
        error.message.includes('already registered')
          ? 'Ese email ya tiene una cuenta creada.'
          : 'No pudimos crear la cuenta. Probá de nuevo.',
      )
      return
    }

    setResultado({ avisoPago })
    window.scrollTo(0, 0)
  }

  if (resultado) {
    return (
      <main className="auth-screen">
        <img src="/drey-logo.png" alt="DREY" className="auth-logo-img" />
        <p className="registro-gracias-titulo">
          {resultado.avisoPago ? 'Pago avisado' : '¡Cuenta creada!'}
        </p>
        <p className="registro-gracias-texto">
          {resultado.avisoPago
            ? 'Avisaste tu pago. Esperando autorización del profesor.'
            : 'Tu cuenta queda pendiente. Cuando pagues, entrá a Suscripción y tocá "Ya pagué".'}
        </p>
        <p className="registro-gracias-texto">
          Te mandamos un email para confirmar tu cuenta. Revisá también la carpeta de spam.
        </p>
        <Link to="/" className="pill-button registro-gracias-boton">
          Volver a iniciar sesión
        </Link>
      </main>
    )
  }

  return (
    <main className="registro-screen">
      <img src="/drey-logo.png" alt="DREY" className="auth-logo-img" />

      <ol className="registro-pasos" aria-label="Pasos del registro">
        {PASOS.map((titulo, indice) => (
          <li
            key={titulo}
            className={
              indice === paso
                ? 'registro-paso registro-paso-actual'
                : indice < paso
                  ? 'registro-paso registro-paso-hecho'
                  : 'registro-paso'
            }
          >
            <span className="registro-paso-numero">{indice + 1}</span>
            <span className="registro-paso-titulo">{titulo}</span>
          </li>
        ))}
      </ol>

      <form className="registro-form" onSubmit={irAlSiguiente}>
        {paso === 0 && (
          <>
            <p className="form-section-label">Tus datos</p>

            <div className="form-row">
              <input
                className="auth-input"
                type="text"
                placeholder="Nombre"
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
              />
              <input
                className="auth-input"
                type="text"
                placeholder="Apellido"
                value={apellido}
                onChange={(event) => setApellido(event.target.value)}
              />
            </div>

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
                value={celular}
                onChange={(event) => setCelular(event.target.value)}
              />
            </div>

            <input
              className="auth-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <div className="auth-input-wrap">
              <input
                className="auth-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <EyeIcon crossed={showPassword} />
              </button>
            </div>

            <div className="auth-input-wrap">
              <input
                className="auth-input"
                type={showConfirmarPassword ? 'text' : 'password'}
                placeholder="Repetir contraseña"
                value={confirmarPassword}
                onChange={(event) => setConfirmarPassword(event.target.value)}
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowConfirmarPassword((value) => !value)}
                aria-label={showConfirmarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <EyeIcon crossed={showConfirmarPassword} />
              </button>
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

            <label className="form-checkbox-row">
              <input
                type="checkbox"
                checked={aceptaPrivacidad}
                onChange={(event) => setAceptaPrivacidad(event.target.checked)}
              />
              <span>
                Acepto la política de privacidad (Ley 18.331 de protección de datos personales).
              </span>
            </label>
          </>
        )}

        {paso === 1 && (
          <>
            <p className="form-section-label">Elegí tu plan</p>

            <div className="plan-opciones">
              {PLANES.map((opcion) => (
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

            <input
              className="auth-input"
              type="text"
              placeholder="Código de descuento (opcional)"
              value={codigoDescuento}
              onChange={(event) => setCodigoDescuento(event.target.value)}
            />
          </>
        )}

        {paso === 2 && (
          <>
            <p className="form-section-label">Elegí tu profe o gimnasio</p>

            {cargandoOpciones ? (
              <p className="registro-edad">Cargando…</p>
            ) : opcionesProfe.length === 0 ? (
              <p className="registro-edad">
                Todavía no hay profes para elegir. Podés seguir: el profe te asigna después.
              </p>
            ) : (
              <div className="plan-opciones">
                {opcionesProfe.map((opcion) => {
                  const activa = eleccion?.tipo === opcion.tipo && eleccion?.id === opcion.id
                  return (
                    <button
                      key={`${opcion.tipo}-${opcion.id}`}
                      type="button"
                      className={activa ? 'plan-card plan-card-activo' : 'plan-card'}
                      onClick={() => setEleccion({ tipo: opcion.tipo, id: opcion.id })}
                    >
                      <span className="plan-card-descripcion">
                        {opcion.tipo === 'profe' ? 'Profe' : 'Gimnasio'}
                      </span>
                      <span className="plan-card-nombre">{opcion.nombre}</span>
                      {opcion.detalle && (
                        <span className="plan-card-precio-siguiente">{opcion.detalle}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}

        {paso === 3 && plan && (
          <>
            <p className="form-section-label">Pago</p>

            <div className="suscripcion-plan-card">
              <p className="suscripcion-plan-nombre">{plan.nombre}</p>
              <p className="suscripcion-plan-precio">
                {formatearPrecio(plan.precioPrimerMes)} el primer mes
              </p>
              {codigoDescuento && (
                <p className="suscripcion-vencimiento">
                  Código {codigoDescuento}: el profe aplica el descuento al confirmar.
                </p>
              )}
            </div>

            <DatosDePago planId={planId} />

            <p className="registro-edad">
              Cuando termines de pagar tocá "Ya pagué". Si preferís pagar después, podés avisar
              desde la pantalla Suscripción.
            </p>
          </>
        )}

        {message && <p className="auth-message">{message}</p>}

        {paso < PASOS.length - 1 ? (
          <button type="submit" className="auth-submit">
            Siguiente
          </button>
        ) : (
          <>
            <button
              type="button"
              className="auth-submit"
              disabled={loading}
              onClick={() => crearCuenta(true)}
            >
              {loading ? 'Creando cuenta…' : 'Ya pagué'}
            </button>
            <button
              type="button"
              className="registro-boton-secundario"
              disabled={loading}
              onClick={() => crearCuenta(false)}
            >
              Pago más tarde
            </button>
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

      <Link to="/" className="auth-switch">
        Ya tengo cuenta
      </Link>
    </main>
  )
}
