import { useEffect, useMemo, useState } from 'react'
import GraficoProgreso from './GraficoProgreso.jsx'
import {
  borrarMedicion,
  cargarMediciones,
  guardarMedicion,
  linksDeFotos,
} from '../services/medidas.js'
import { mostrarAviso } from '../services/avisos.js'
import {
  CAMPOS_MEDIDA,
  VISTAS_FOTO,
  alturaConocida,
  calcularIMC,
  cambioDe,
  ordenarPorFecha,
  serieDe,
} from '../utils/medidas.js'
import { formatearNumero } from '../utils/progreso.js'
import { obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'
import Esqueleto from './Esqueleto.jsx'

// Todo lo de las medidas de un cliente: resumen (cuánto cambió cada
// medida desde el inicio), gráfica, fotos de antes y ahora, historial y
// el formulario para cargar una medición nueva. La usan la pantalla del
// alumno (Mis medidas) y la del profe (ficha del cliente → Medidas).
//
// La primera medición es la "evaluación inicial": además pide la altura.
export default function PanelMedidas({ clienteId, esProfe = false }) {
  const [mediciones, setMediciones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [formulario, setFormulario] = useState(false)
  const [campoGrafica, setCampoGrafica] = useState('peso')
  const [vista, setVista] = useState('frente')
  const [links, setLinks] = useState({})
  const [borrandoId, setBorrandoId] = useState(null)

  useEffect(() => {
    cargar()
  }, [clienteId])

  async function cargar() {
    setCargando(true)
    const resultado = await cargarMediciones(clienteId)
    setMediciones(resultado.mediciones)
    setError(resultado.error ? 'No pudimos cargar las medidas. Revisá tu conexión.' : '')
    setLinks(
      await linksDeFotos(resultado.mediciones.flatMap((medicion) => Object.values(medicion.fotos || {}))),
    )
    setCargando(false)
  }

  async function borrar(medicion) {
    const problema = await borrarMedicion(medicion)
    setBorrandoId(null)
    mostrarAviso(problema ? 'No pudimos borrarla' : 'Medición borrada', problema ? 'error' : 'ok')
    if (!problema) cargar()
  }

  const ordenadas = useMemo(() => ordenarPorFecha(mediciones), [mediciones])
  const camposConDatos = CAMPOS_MEDIDA.filter((campo) => cambioDe(mediciones, campo.clave))
  const altura = alturaConocida(mediciones)
  const ultimoPeso = cambioDe(mediciones, 'peso')?.ultima
  const imc = calcularIMC(ultimoPeso, altura)
  const conFoto = ordenadas.filter((medicion) => medicion.fotos?.[vista])
  const fotoAntes = conFoto[0]
  const fotoAhora = conFoto.length > 1 ? conFoto[conFoto.length - 1] : null

  if (cargando) return <Esqueleto filas={2} />

  return (
    <div className="medidas">
      {error && <p className="auth-message">{error}</p>}

      {formulario ? (
        <FormularioMedicion
          clienteId={clienteId}
          esInicial={mediciones.length === 0}
          esProfe={esProfe}
          alturaAnterior={altura}
          onGuardado={() => {
            setFormulario(false)
            cargar()
          }}
          onCancelar={() => setFormulario(false)}
        />
      ) : (
        <button type="button" className="boton-principal" onClick={() => setFormulario(true)}>
          {mediciones.length === 0 ? '+ Cargar evaluación inicial' : '+ Cargar medidas de hoy'}
        </button>
      )}

      {mediciones.length === 0 ? (
        !formulario && (
          <p className="profe-vacio">
            Todavía no hay medidas. La primera es la evaluación inicial: peso, altura, perímetros y
            fotos. Después, conviene repetirla cada 4 semanas.
          </p>
        )
      ) : (
        <>
          <section className="bloque-pagina">
            <p className="seccion-etiqueta">Desde el inicio</p>
            <div className="medidas-resumen">
              {camposConDatos.map((campo) => {
                const cambio = cambioDe(mediciones, campo.clave)
                return (
                  <button
                    type="button"
                    key={campo.clave}
                    className={
                      campo.clave === campoGrafica ? 'medida-tarjeta medida-activa' : 'medida-tarjeta'
                    }
                    onClick={() => setCampoGrafica(campo.clave)}
                  >
                    <span className="dato-etiqueta">{campo.etiqueta}</span>
                    <strong>
                      {formatearNumero(cambio.ultima)} {campo.unidad}
                    </strong>
                    {cambio.cantidad > 1 && (
                      <small className={cambio.cambio === 0 ? '' : 'medida-cambio'}>
                        {cambio.cambio > 0 ? '+' : ''}
                        {formatearNumero(cambio.cambio)} {campo.unidad}
                      </small>
                    )}
                  </button>
                )
              })}
              {imc && (
                <div className="medida-tarjeta">
                  <span className="dato-etiqueta">IMC</span>
                  <strong>{formatearNumero(imc)}</strong>
                  <small>altura {formatearNumero(Number(altura))} cm</small>
                </div>
              )}
            </div>
          </section>

          {serieDe(mediciones, campoGrafica).length > 1 && (
            <GraficoProgreso
              titulo={CAMPOS_MEDIDA.find((campo) => campo.clave === campoGrafica)?.etiqueta}
              puntos={serieDe(mediciones, campoGrafica)}
              unidad={` ${CAMPOS_MEDIDA.find((campo) => campo.clave === campoGrafica)?.unidad}`}
            />
          )}

          {ordenadas.some((medicion) => Object.keys(medicion.fotos || {}).length) && (
            <section className="bloque-pagina">
              <p className="seccion-etiqueta">Fotos: antes y ahora</p>
              <div className="chips-lista">
                {VISTAS_FOTO.map((opcion) => (
                  <button
                    key={opcion.clave}
                    type="button"
                    className={opcion.clave === vista ? 'chip chip-activo' : 'chip'}
                    onClick={() => setVista(opcion.clave)}
                  >
                    {opcion.etiqueta}
                  </button>
                ))}
              </div>
              {fotoAntes ? (
                <div className="medidas-fotos">
                  <Foto medicion={fotoAntes} vista={vista} links={links} titulo="Antes" />
                  {fotoAhora && <Foto medicion={fotoAhora} vista={vista} links={links} titulo="Ahora" />}
                </div>
              ) : (
                <p className="profe-vacio">No hay fotos de {vista} todavía.</p>
              )}
            </section>
          )}

          <section className="bloque-pagina">
            <p className="seccion-etiqueta">Historial</p>
            <div className="lista-tarjetas">
              {[...ordenadas].reverse().map((medicion) => (
                <div key={medicion.id} className="medicion-fila">
                  <div className="medicion-fila-textos">
                    <strong>
                      {textoFechaCorta(medicion.fecha)}
                      {medicion.tipo === 'inicial' ? ' · Evaluación inicial' : ''}
                    </strong>
                    <small>{resumenDeMedicion(medicion)}</small>
                    {medicion.notas && <small className="medicion-notas">"{medicion.notas}"</small>}
                  </div>
                  {borrandoId === medicion.id ? (
                    <div className="codigo-item-acciones">
                      <button
                        type="button"
                        className="boton-peligro boton-chico"
                        onClick={() => borrar(medicion)}
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
                    <button
                      type="button"
                      className="boton-texto codigo-borrar"
                      onClick={() => setBorrandoId(medicion.id)}
                      aria-label="Borrar esta medición"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function Foto({ medicion, vista, links, titulo }) {
  const url = links[medicion.fotos?.[vista]]
  return (
    <figure className="medidas-foto">
      {url ? <img src={url} alt={`${titulo}: ${vista}`} /> : <span>Foto no disponible</span>}
      <figcaption>
        {titulo} · {textoFechaCorta(medicion.fecha)}
      </figcaption>
    </figure>
  )
}

function resumenDeMedicion(medicion) {
  const partes = CAMPOS_MEDIDA.filter((campo) => medicion[campo.clave] != null).map(
    (campo) => `${campo.etiqueta} ${formatearNumero(Number(medicion[campo.clave]))} ${campo.unidad}`,
  )
  const fotos = Object.keys(medicion.fotos || {}).length
  if (fotos) partes.push(`${fotos} ${fotos === 1 ? 'foto' : 'fotos'}`)
  return partes.join(' · ') || 'Sin datos'
}

function FormularioMedicion({ clienteId, esInicial, esProfe, alturaAnterior, onGuardado, onCancelar }) {
  const [valores, setValores] = useState({ fecha: obtenerFechaHoyISO(), altura: alturaAnterior || '' })
  const [fotos, setFotos] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  function cambiar(clave, valor) {
    setValores((actual) => ({ ...actual, [clave]: valor }))
  }

  async function guardar(event) {
    event.preventDefault()
    const datos = { fecha: valores.fecha, tipo: esInicial ? 'inicial' : 'control' }
    for (const campo of CAMPOS_MEDIDA) {
      const texto = String(valores[campo.clave] ?? '').replace(',', '.').trim()
      if (texto) datos[campo.clave] = Number(texto)
    }
    if (esInicial && String(valores.altura).trim()) {
      datos.altura = Number(String(valores.altura).replace(',', '.'))
    }
    if (valores.notas?.trim()) datos.notas = valores.notas.trim()
    const hayAlgo =
      CAMPOS_MEDIDA.some((campo) => datos[campo.clave] !== undefined) ||
      Object.values(fotos).some(Boolean)
    if (!hayAlgo) {
      setMensaje('Cargá al menos una medida o una foto.')
      return
    }
    if (Object.values(datos).some((valor) => typeof valor === 'number' && Number.isNaN(valor))) {
      setMensaje('Revisá los números: hay uno que no se entiende.')
      return
    }
    setGuardando(true)
    setMensaje('')
    const error = await guardarMedicion(clienteId, datos, fotos)
    setGuardando(false)
    if (error) {
      setMensaje(error.message?.includes('check') ? 'Algún valor está fuera de rango.' : error.message || 'No pudimos guardar.')
      return
    }
    mostrarAviso('Medidas guardadas')
    onGuardado()
  }

  return (
    <form className="medidas-formulario" onSubmit={guardar}>
      <p className="seccion-etiqueta">{esInicial ? 'Evaluación inicial' : 'Medidas de hoy'}</p>
      {esInicial && (
        <p className="profe-nota">
          {esProfe
            ? 'Tomá las medidas siempre en el mismo lugar del cuerpo y a la misma hora, así se pueden comparar.'
            : 'Medite en ayunas, a la mañana, siempre en el mismo lugar del cuerpo. Si no sabés alguna, dejala vacía: tu profe te ayuda.'}
        </p>
      )}
      <label className="editor-campo">
        <span>Fecha</span>
        <input
          className="auth-input"
          type="date"
          value={valores.fecha}
          max={obtenerFechaHoyISO()}
          onChange={(event) => cambiar('fecha', event.target.value)}
        />
      </label>
      <div className="medidas-campos">
        {esInicial && (
          <label className="editor-campo">
            <span>Altura (cm)</span>
            <input
              className="auth-input"
              type="number"
              inputMode="decimal"
              step="0.5"
              value={valores.altura}
              onChange={(event) => cambiar('altura', event.target.value)}
            />
          </label>
        )}
        {CAMPOS_MEDIDA.map((campo) => (
          <label key={campo.clave} className="editor-campo">
            <span>
              {campo.etiqueta} ({campo.unidad})
            </span>
            <input
              className="auth-input"
              type="number"
              inputMode="decimal"
              step={campo.paso}
              value={valores[campo.clave] ?? ''}
              onChange={(event) => cambiar(campo.clave, event.target.value)}
            />
          </label>
        ))}
      </div>

      <p className="editor-rango-etiqueta">Fotos de progreso (opcional, solo las ven vos y tu profe)</p>
      <div className="medidas-fotos-carga">
        {VISTAS_FOTO.map((opcion) => (
          <label key={opcion.clave} className="suscripcion-adjuntar medidas-adjuntar">
            {fotos[opcion.clave] ? `✓ ${opcion.etiqueta}` : `+ ${opcion.etiqueta}`}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) =>
                setFotos((actual) => ({ ...actual, [opcion.clave]: event.target.files?.[0] || null }))
              }
            />
          </label>
        ))}
      </div>

      <textarea
        className="form-textarea"
        placeholder={esProfe ? 'Observaciones (opcional)' : 'Notas (opcional): cómo te sentís, cambios…'}
        value={valores.notas || ''}
        onChange={(event) => cambiar('notas', event.target.value)}
      />

      {mensaje && <p className="auth-message">{mensaje}</p>}
      <div className="acciones-columna">
        <button type="submit" className="boton-principal" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar medidas'}
        </button>
        <button type="button" className="boton-texto" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
