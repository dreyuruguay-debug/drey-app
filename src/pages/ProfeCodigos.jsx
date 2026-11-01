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
import { esAdminConocido, verificarProfe } from '../services/accesoProfe.js'
import { useEspacios } from '../services/espacio.js'
import { cargarEspaciosAdmin } from '../services/suscripcionDrey.js'
import { formatearPrecio, listaDePlanes } from '../data/planes.js'
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

// Códigos de descuento (se entra desde Cobros).
//   · "Del plan": el alumno lo escribe al registrarse o al pagar y paga
//     con el descuento. Se puede limitar a un plan, al primer mes, a una
//     cantidad de usos y a una fecha. Cada código es de UN espacio y vale
//     solo para sus planes (supabase/sql/034): el dueño ve y crea los de
//     su espacio activo; el Admin ve todos y elige el espacio al crear.
//   · "De ropa": beneficios de la marca de ropa DREY. Los ven los
//     clientes con el plan al día en "Comunidad y beneficios". Los crean
//     el Admin y los profes de confianza.
export default function ProfeCodigos() {
  const [tipo, setTipo] = useState('plan')
  const [codigos, setCodigos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [formulario, setFormulario] = useState(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [borrandoId, setBorrandoId] = useState(null)
  const { activo: espacio } = useEspacios()
  const [esAdmin, setEsAdmin] = useState(esAdminConocido)
  // Solo el Admin: los espacios para elegir de quién es el código.
  const [espacios, setEspacios] = useState([])
  const [espacioCodigo, setEspacioCodigo] = useState('')
  // El espacio de los códigos de plan: el activo o el que eligió el Admin.
  const espacioId = esAdmin ? espacioCodigo : espacio?.id || ''

  useEffect(() => {
    cargar()
    verificarProfe().then(({ esAdmin: admin }) => {
      setEsAdmin(Boolean(admin))
      if (!admin) return
      cargarEspaciosAdmin().then(({ espacios: lista }) => {
        setEspacios(lista)
        setEspacioCodigo((actual) => actual || lista[0]?.id || '')
      })
    })
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
    if (tipo === 'plan' && !espacioId) {
      setMensaje('Elegí de qué profe o gimnasio es el código.')
      return
    }
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
      // Los de plan son del espacio (SQL 034); los de ropa, de DREY.
      ...(tipo === 'plan' && espacioId ? { espacio_id: espacioId } : {}),
      usos_maximos: formulario.usosMaximos ? Number(formulario.usosMaximos) : null,
      vence: formulario.vence || null,
    })
    setGuardando(false)
    if (error) {
      // Los de plan los crea el dueño del espacio; los de ropa, el Admin
      // y los profes de confianza (SQL 033 y 034).
      setMensaje(
        /row-level security/i.test(error.message || '')
          ? tipo === 'ropa'
            ? 'Los beneficios de ropa los carga DREY. Escribinos si querés sumar uno.'
            : 'Solo el dueño del espacio crea sus códigos de descuento.'
          : error.message || 'No pudimos guardar el código.',
      )
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

  // Los de plan: los del espacio activo (el Admin ve todos).
  const lista = codigos.filter(
    (item) =>
      item.tipo === tipo &&
      (tipo !== 'plan' || esAdmin || !espacio || item.espacio_id === espacio.id),
  )
  const nombreEspacio = (id) => espacios.find((item) => item.id === id)?.nombre || ''
  const planesDelEspacio = espacioId ? listaDePlanes({ espacioId }) : listaDePlanes()

  return (
    <ProfeLayout titulo="Códigos de descuento" volverA="/profe/cuentas">
      <Pestanas etiqueta="Tipo de código" opciones={TIPOS} activa={tipo} onCambiar={setTipo} />

      <p className="profe-nota">
        {tipo === 'plan'
          ? 'Tu alumno lo escribe al registrarse o al pagar y paga con el descuento. Vale solo para tus planes.'
          : 'Los clientes con el plan al día los ven en "Comunidad y beneficios".'}
      </p>

      {cargando ? (
        <Esqueleto />
      ) : lista.length === 0 ? (
        <p className="profe-vacio">
          Todavía no creaste códigos {tipo === 'plan' ? 'del plan' : 'de ropa'}.
        </p>
      ) : (
        <div className="lista-tarjetas">
          {lista.map((item) => (
            <div
              key={item.id}
              className={item.activo ? 'codigo-item' : 'codigo-item codigo-pausado'}
            >
              <div className="codigo-item-textos">
                <strong>{item.codigo}</strong>
                <small>
                  {describirCodigo(item)}
                  {esAdmin && item.espacio_id ? ` · ${nombreEspacio(item.espacio_id)}` : ''}
                </small>
              </div>
              {borrandoId === item.id ? (
                <div className="codigo-item-acciones">
                  <button
                    type="button"
                    className="boton-peligro boton-chico"
                    onClick={() => borrar(item.id)}
                  >
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
          onChange={(event) =>
            cambiar('codigo', event.target.value.toUpperCase().replace(/\s/g, ''))
          }
        />

        {tipo === 'plan' ? (
          <>
            {esAdmin && (
              <select
                className="profe-calendario-select"
                value={espacioCodigo}
                onChange={(event) => {
                  setEspacioCodigo(event.target.value)
                  cambiar('plan', '')
                }}
                aria-label="De qué profe o gimnasio"
              >
                {espacios.map((item) => (
                  <option key={item.id} value={item.id}>
                    Para alumnos de {item.nombre}
                  </option>
                ))}
              </select>
            )}
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
              {planesDelEspacio.map((plan) => (
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
      partes.push(
        item.planes
          .map((id) => listaDePlanes().find((plan) => plan.id === id)?.nombre || id)
          .join(', '),
      )
    }
    partes.push(
      item.usos_maximos ? `${item.usos} de ${item.usos_maximos} usos` : `${item.usos} usos`,
    )
    if (item.descripcion) partes.push(item.descripcion)
  }
  if (item.vence) partes.push(`vence ${textoFechaCorta(item.vence)}`)
  if (!item.activo) partes.push('pausado')
  return partes.join(' · ')
}
