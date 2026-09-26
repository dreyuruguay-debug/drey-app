import { useEffect, useState } from 'react'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Pestanas from '../components/Pestanas.jsx'
import {
  borrarCodigo,
  cambiarCodigoActivo,
  cargarCodigosDelProfe,
  crearCodigo,
} from '../services/codigos.js'
import { mostrarAviso } from '../services/avisos.js'
import { PLANES, formatearPrecio } from '../data/planes.js'
import { textoFechaCorta } from '../utils/dias.js'
import Esqueleto from '../components/Esqueleto.jsx'

const TIPOS = [
  { id: 'plan', label: 'Del plan' },
  { id: 'ropa', label: 'De ropa' },
]

const VACIO = {
  codigo: '',
  descripcion: '',
  forma: 'porcentaje', // 'porcentaje' | 'monto'
  valor: '',
  soloPrimerMes: true,
  plan: '', // '' = todos los planes
  usosMaximos: '',
  vence: '',
}

// Códigos de descuento (se entra desde Pagos).
//   · "Del plan": el cliente lo escribe al registrarse o al pagar y
//     Mercado Pago le cobra con el descuento. Se puede limitar a un plan,
//     al primer mes, a una cantidad de usos y a una fecha.
//   · "De ropa": beneficios de la marca de ropa DREY. Los ven los
//     clientes con el plan al día en "Comunidad y beneficios".
export default function ProfeCodigos() {
  const [tipo, setTipo] = useState('plan')
  const [codigos, setCodigos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [formulario, setFormulario] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [borrandoId, setBorrandoId] = useState(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    const { codigos: lista, error } = await cargarCodigosDelProfe()
    setCodigos(lista)
    setMensaje(error ? 'No pudimos cargar los códigos. ¿Instalaste la base de datos (PASO 1)?' : '')
    setCargando(false)
  }

  function cambiar(campo, valor) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }))
  }

  async function guardar(event) {
    event.preventDefault()
    const codigo = formulario.codigo.trim()
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(codigo)) {
      setMensaje('El código tiene que tener entre 3 y 20 letras o números, sin espacios.')
      return
    }
    const valor = Number(formulario.valor)
    if (tipo === 'plan') {
      if (!valor || valor <= 0) {
        setMensaje('Escribí cuánto descuenta.')
        return
      }
      if (formulario.forma === 'porcentaje' && valor > 100) {
        setMensaje('El porcentaje no puede ser más de 100.')
        return
      }
    } else if (!formulario.descripcion.trim()) {
      setMensaje('Escribí qué beneficio da (por ejemplo: 10% en toda la ropa DREY).')
      return
    }

    setGuardando(true)
    setMensaje('')
    const error = await crearCodigo({
      codigo,
      tipo,
      descripcion: formulario.descripcion.trim() || null,
      porcentaje: tipo === 'plan' && formulario.forma === 'porcentaje' ? valor : null,
      monto_fijo: tipo === 'plan' && formulario.forma === 'monto' ? Math.round(valor) : null,
      solo_primer_mes: tipo === 'plan' ? formulario.soloPrimerMes : false,
      planes: tipo === 'plan' && formulario.plan ? [formulario.plan] : [],
      usos_maximos: formulario.usosMaximos ? Number(formulario.usosMaximos) : null,
      vence: formulario.vence || null,
    })
    setGuardando(false)
    if (error) {
      setMensaje(error.message || 'No pudimos guardar el código.')
      return
    }
    mostrarAviso('Código creado')
    setFormulario(VACIO)
    cargar()
  }

  async function alternarActivo(item) {
    const error = await cambiarCodigoActivo(item.id, !item.activo)
    mostrarAviso(
      error ? 'No pudimos guardar el cambio' : item.activo ? 'Código pausado' : 'Código activado',
      error ? 'error' : 'ok',
    )
    if (!error) cargar()
  }

  async function borrar(id) {
    const error = await borrarCodigo(id)
    setBorrandoId(null)
    mostrarAviso(error ? 'No pudimos borrarlo' : 'Código borrado', error ? 'error' : 'ok')
    if (!error) cargar()
  }

  const lista = codigos.filter((item) => item.tipo === tipo)

  return (
    <ProfeLayout titulo="Códigos de descuento" volverA="/profe/cuentas">
      <Pestanas etiqueta="Tipo de código" opciones={TIPOS} activa={tipo} onCambiar={setTipo} />

      <p className="profe-nota">
        {tipo === 'plan'
          ? 'El cliente lo escribe al registrarse o al pagar, y Mercado Pago le cobra con el descuento.'
          : 'Los clientes con el plan al día los ven en "Comunidad y beneficios".'}
      </p>

      {cargando ? (
        <Esqueleto />
      ) : lista.length === 0 ? (
        <p className="profe-vacio">Todavía no creaste códigos {tipo === 'plan' ? 'del plan' : 'de ropa'}.</p>
      ) : (
        <div className="lista-tarjetas">
          {lista.map((item) => (
            <div key={item.id} className={item.activo ? 'codigo-item' : 'codigo-item codigo-pausado'}>
              <div className="codigo-item-textos">
                <strong>{item.codigo}</strong>
                <small>{describirCodigo(item)}</small>
              </div>
              {borrandoId === item.id ? (
                <div className="codigo-item-acciones">
                  <button type="button" className="boton-peligro boton-chico" onClick={() => borrar(item.id)}>
                    Borrar
                  </button>
                  <button
                    type="button"
                    className="boton-secundario boton-chico"
                    onClick={() => setBorrandoId(null)}
                  >
                    No
                  </button>
                </div>
              ) : (
                <div className="codigo-item-acciones">
                  <button
                    type="button"
                    className="boton-secundario boton-chico"
                    onClick={() => alternarActivo(item)}
                  >
                    {item.activo ? 'Pausar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    className="boton-texto codigo-borrar"
                    onClick={() => setBorrandoId(item.id)}
                    aria-label={`Borrar ${item.codigo}`}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="profe-seccion-label">Nuevo código {tipo === 'plan' ? 'del plan' : 'de ropa'}</p>
      <form className="profe-form-ejercicio codigo-form" onSubmit={guardar}>
        <input
          className="auth-input"
          type="text"
          placeholder="Código (ej. DREY20)"
          value={formulario.codigo}
          onChange={(event) => cambiar('codigo', event.target.value.toUpperCase().replace(/\s/g, ''))}
        />

        {tipo === 'plan' ? (
          <>
            <div className="codigo-fila">
              <select
                className="profe-calendario-select"
                value={formulario.forma}
                onChange={(event) => cambiar('forma', event.target.value)}
                aria-label="Tipo de descuento"
              >
                <option value="porcentaje">% de descuento</option>
                <option value="monto">$U de descuento</option>
              </select>
              <input
                className="auth-input"
                type="number"
                min="1"
                placeholder={formulario.forma === 'porcentaje' ? 'Ej. 20' : 'Ej. 500'}
                value={formulario.valor}
                onChange={(event) => cambiar('valor', event.target.value)}
                aria-label="Cuánto descuenta"
              />
            </div>
            <select
              className="profe-calendario-select"
              value={formulario.plan}
              onChange={(event) => cambiar('plan', event.target.value)}
              aria-label="Para qué plan"
            >
              <option value="">Para todos los planes</option>
              {PLANES.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  Solo {plan.nombre}
                </option>
              ))}
            </select>
            <label className="form-checkbox-row">
              <input
                type="checkbox"
                checked={formulario.soloPrimerMes}
                onChange={(event) => cambiar('soloPrimerMes', event.target.checked)}
              />
              <span>Solo el primer mes (si no, vale en cada pago)</span>
            </label>
            <input
              className="auth-input"
              type="text"
              placeholder="Nota para vos (opcional)"
              value={formulario.descripcion}
              onChange={(event) => cambiar('descripcion', event.target.value)}
            />
          </>
        ) : (
          <input
            className="auth-input"
            type="text"
            placeholder="Beneficio (ej. 10% en toda la ropa DREY)"
            value={formulario.descripcion}
            onChange={(event) => cambiar('descripcion', event.target.value)}
          />
        )}

        <div className="codigo-fila">
          {tipo === 'plan' && (
            <input
              className="auth-input"
              type="number"
              min="1"
              placeholder="Usos máx. (opcional)"
              value={formulario.usosMaximos}
              onChange={(event) => cambiar('usosMaximos', event.target.value)}
            />
          )}
          <label className="codigo-vence">
            <span>Vence (opcional)</span>
            <input
              className="auth-input"
              type="date"
              value={formulario.vence}
              onChange={(event) => cambiar('vence', event.target.value)}
            />
          </label>
        </div>

        {mensaje && <p className="auth-message">{mensaje}</p>}
        <button type="submit" className="boton-principal" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Crear código'}
        </button>
      </form>
    </ProfeLayout>
  )
}

// "20% · solo el primer mes · 3 de 10 usos · vence 30 sep."
function describirCodigo(item) {
  const partes = []
  if (item.tipo === 'ropa') {
    partes.push(item.descripcion || 'Beneficio de ropa')
  } else {
    if (item.porcentaje) partes.push(`${Number(item.porcentaje)}% de descuento`)
    if (item.monto_fijo) partes.push(`${formatearPrecio(item.monto_fijo)} de descuento`)
    partes.push(item.solo_primer_mes ? 'solo el primer mes' : 'en cada pago')
    if (item.planes?.length) {
      partes.push(item.planes.map((id) => PLANES.find((plan) => plan.id === id)?.nombre || id).join(', '))
    }
    partes.push(item.usos_maximos ? `${item.usos} de ${item.usos_maximos} usos` : `${item.usos} usos`)
    if (item.descripcion) partes.push(item.descripcion)
  }
  if (item.vence) partes.push(`vence ${textoFechaCorta(item.vence)}`)
  if (!item.activo) partes.push('pausado')
  return partes.join(' · ')
}
