import { useEffect, useMemo, useState } from 'react'
import GraficoProgreso from './GraficoProgreso.jsx'
import {
  agregarFotos,
  borrarFoto,
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
  CLAVE_OTRAS_FOTOS,
  fotosDeMedicion,
  ordenarPorFecha,
  rutasDeFotos,
  serieDe,
} from '../utils/medidas.js'
import VisorFotos from './VisorFotos.jsx'
import { formatearNumero } from '../utils/progreso.js'
import { obtenerFechaHoyISO, textoFechaCorta } from '../utils/dias.js'
import Esqueleto from './Esqueleto.jsx'

// Todo lo de las medidas de un cliente: resumen (cuánto cambió cada
// medida desde el inicio), gráfica, fotos de antes y ahora (se puede
// elegir qué fechas comparar), TODAS las fotos por fecha, historial y el
// formulario para cargar una medición nueva. La usan la pantalla del
// alumno (Mis medidas) y la del profe (ficha del cliente → Medidas).
//
// Ninguna foto reemplaza a otra: se guardan todas (varias de la misma
// vista, "otras" y las que se agregan después a una fecha). Tocando una
// se ve en grande, con anterior / siguiente y "Borrar esta foto".
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
  // Fechas elegidas para comparar (ids de medición); null = la primera y
  // la última con foto de esa vista.
  const [comparar, setComparar] = useState({ antes: null, ahora: null })
  // Visor abierto: posición dentro de "todasLasFotos".
  const [visor, setVisor] = useState(null)
  const [borrandoFoto, setBorrandoFoto] = useState(null)

  useEffect(() => {
    cargar()
  }, [clienteId])

  async function cargar() {
    setCargando(true)
    const resultado = await cargarMediciones(clienteId)
    setMediciones(resultado.mediciones)
    setError(resultado.error ? 'No pudimos cargar las medidas. Revisá tu conexión.' : '')
    setLinks(await linksDeFotos(resultado.mediciones.flatMap(rutasDeFotos)))
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
  const fotoAntes = conFoto.find((medicion) => medicion.id === comparar.antes) || conFoto[0]
  const fotoAhora =
    conFoto.find((medicion) => medicion.id === comparar.ahora) ||
    (conFoto.length > 1 ? conFoto[conFoto.length - 1] : null)
  // Todas las fotos, de la fecha más nueva a la más vieja (para la
  // galería y el visor).
  const todasLasFotos = [...ordenadas].reverse().flatMap((medicion) =>
    fotosDeMedicion(medicion).map((foto) => ({
      ...foto,
      medicion,
      url: links[foto.ruta],
      titulo: `${foto.etiqueta} · ${textoFechaCorta(medicion.fecha)}`,
      detalle: medicion.tipo === 'inicial' ? 'Evaluación inicial' : '',
    })),
  )

  function abrirFoto(ruta) {
    setBorrandoFoto(null)
    setVisor(todasLasFotos.findIndex((foto) => foto.ruta === ruta))
  }

  async function quitarUnaFoto(foto) {
    const problema = await borrarFoto(foto.medicion, foto.ruta)
    setBorrandoFoto(null)
    mostrarAviso(problema ? 'No pudimos borrarla' : 'Foto borrada', problema ? 'error' : 'ok')
    if (problema) return
    setVisor(null)
    cargar()
  }

  async function sumarFotosA(medicion, vistaElegida, archivos) {
    if (!archivos.length) return
    const problema = await agregarFotos(
      medicion,
      archivos.map((archivo) => ({ vista: vistaElegida, archivo })),
    )
    mostrarAviso(
      problema
        ? problema.message || 'No pudimos guardar las fotos'
        : archivos.length === 1
          ? 'Foto agregada'
          : `${archivos.length} fotos agregadas`,
      problema ? 'error' : 'ok',
    )
    if (!problema) cargar()
  }

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
                      campo.clave === campoGrafica
                        ? 'medida-tarjeta medida-activa'
                        : 'medida-tarjeta'
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

          {todasLasFotos.length > 0 && (
            <section className="bloque-pagina">
              <p className="seccion-etiqueta">Fotos: antes y ahora</p>
              <div className="chips-lista">
                {VISTAS_FOTO.map((opcion) => (
                  <button
                    key={opcion.clave}
                    type="button"
                    className={opcion.clave === vista ? 'chip chip-activo' : 'chip'}
                    onClick={() => {
                      setVista(opcion.clave)
                      setComparar({ antes: null, ahora: null })
                    }}
                  >
                    {opcion.etiqueta}
                  </button>
                ))}
              </div>
              {fotoAntes ? (
                <>
                  <div className="medidas-fotos">
                    <Foto
                      medicion={fotoAntes}
                      vista={vista}
                      links={links}
                      titulo="Antes"
                      onAbrir={() => abrirFoto(fotoAntes.fotos[vista])}
                    />
                    {fotoAhora && (
                      <Foto
                        medicion={fotoAhora}
                        vista={vista}
                        links={links}
                        titulo="Ahora"
                        onAbrir={() => abrirFoto(fotoAhora.fotos[vista])}
                      />
                    )}
                  </div>
                  {conFoto.length > 2 && (
                    <div className="medidas-comparar">
                      <label className="editor-campo">
                        <span>Antes</span>
                        <select
                          className="profe-calendario-select"
                          value={fotoAntes.id}
                          onChange={(event) =>
                            setComparar((actual) => ({ ...actual, antes: event.target.value }))
                          }
                        >
                          {conFoto.map((medicion) => (
                            <option key={medicion.id} value={medicion.id}>
                              {textoFechaCorta(medicion.fecha)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="editor-campo">
                        <span>Ahora</span>
                        <select
                          className="profe-calendario-select"
                          value={fotoAhora?.id || ''}
                          onChange={(event) =>
                            setComparar((actual) => ({ ...actual, ahora: event.target.value }))
                          }
                        >
                          {conFoto.map((medicion) => (
                            <option key={medicion.id} value={medicion.id}>
                              {textoFechaCorta(medicion.fecha)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </>
              ) : (
                <p className="profe-vacio">
                  No hay fotos de{' '}
                  {VISTAS_FOTO.find((opcion) => opcion.clave === vista)?.etiqueta.toLowerCase()}{' '}
                  todavía.
                </p>
              )}
            </section>
          )}

          {todasLasFotos.length > 0 && (
            <section className="bloque-pagina">
              <p className="seccion-etiqueta">Todas las fotos ({todasLasFotos.length})</p>
              <div className="medidas-galeria">
                {[...ordenadas].reverse().map((medicion) => {
                  const fotos = fotosDeMedicion(medicion)
                  if (!fotos.length) return null
                  return (
                    <div key={medicion.id} className="medidas-galeria-fecha">
                      <div className="medidas-galeria-cabecera">
                        <strong>
                          {textoFechaCorta(medicion.fecha)}
                          {medicion.tipo === 'inicial' ? ' · Evaluación inicial' : ''}
                        </strong>
                        <AgregarFotos
                          onElegir={(vistaElegida, archivos) =>
                            sumarFotosA(medicion, vistaElegida, archivos)
                          }
                        />
                      </div>
                      <div className="medidas-galeria-fotos">
                        {fotos.map((foto) => (
                          <button
                            key={foto.ruta}
                            type="button"
                            className="medidas-galeria-foto"
                            onClick={() => abrirFoto(foto.ruta)}
                            aria-label={`Ver en grande: ${foto.etiqueta}, ${textoFechaCorta(medicion.fecha)}`}
                          >
                            {links[foto.ruta] ? (
                              <img src={links[foto.ruta]} alt="" loading="lazy" />
                            ) : (
                              <span>Sin vista previa</span>
                            )}
                            <small>{foto.etiqueta}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {visor !== null && todasLasFotos[visor] && (
            <VisorFotos
              fotos={todasLasFotos}
              indice={visor}
              onCambiar={(indice) => {
                setBorrandoFoto(null)
                setVisor(indice)
              }}
              onCerrar={() => setVisor(null)}
              acciones={(foto) =>
                borrandoFoto === foto.ruta ? (
                  <button
                    type="button"
                    className="boton-peligro"
                    onClick={() => quitarUnaFoto(foto)}
                  >
                    Sí, borrar esta foto
                  </button>
                ) : (
                  <button
                    type="button"
                    className="boton-texto"
                    onClick={() => setBorrandoFoto(foto.ruta)}
                  >
                    Borrar esta foto
                  </button>
                )
              }
            />
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

function Foto({ medicion, vista, links, titulo, onAbrir }) {
  const url = links[medicion.fotos?.[vista]]
  return (
    <figure className="medidas-foto">
      {url ? (
        <button type="button" className="medidas-foto-boton" onClick={onAbrir}>
          <img src={url} alt={`${titulo}: ${vista}`} />
        </button>
      ) : (
        <span>Foto no disponible</span>
      )}
      <figcaption>
        {titulo} · {textoFechaCorta(medicion.fecha)}
      </figcaption>
    </figure>
  )
}

// Vista previa de una foto elegida en el formulario (todavía no subida),
// con ✕ para sacarla.
function MiniaturaArchivo({ archivo, etiqueta, onQuitar }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const direccion = URL.createObjectURL(archivo)
    setUrl(direccion)
    return () => URL.revokeObjectURL(direccion)
  }, [archivo])
  return (
    <figure className="medidas-miniatura">
      {url && <img src={url} alt="" />}
      <figcaption>✓ {etiqueta}</figcaption>
      <button type="button" onClick={onQuitar} aria-label={`Quitar la foto ${etiqueta}`}>
        ✕
      </button>
    </figure>
  )
}

// "+ Agregar fotos" a una fecha que ya está cargada: se elige qué vista
// son y una o varias fotos. Se suman a las que ya había (no reemplazan).
function AgregarFotos({ onElegir }) {
  const [vista, setVista] = useState(CLAVE_OTRAS_FOTOS)
  const [subiendo, setSubiendo] = useState(false)

  async function elegir(event) {
    const archivos = [...(event.target.files || [])]
    event.target.value = ''
    if (!archivos.length) return
    setSubiendo(true)
    await onElegir(vista, archivos)
    setSubiendo(false)
  }

  return (
    <div className="medidas-agregar">
      <select
        className="profe-calendario-select"
        value={vista}
        onChange={(event) => setVista(event.target.value)}
        aria-label="Qué foto es"
        disabled={subiendo}
      >
        {VISTAS_FOTO.map((opcion) => (
          <option key={opcion.clave} value={opcion.clave}>
            {opcion.etiqueta}
          </option>
        ))}
        <option value={CLAVE_OTRAS_FOTOS}>Otra</option>
      </select>
      <label
        className={
          subiendo
            ? 'boton-secundario boton-chico boton-deshabilitado'
            : 'boton-secundario boton-chico'
        }
      >
        {subiendo ? 'Subiendo…' : '+ Agregar fotos'}
        <input type="file" accept="image/*" multiple hidden disabled={subiendo} onChange={elegir} />
      </label>
    </div>
  )
}

function resumenDeMedicion(medicion) {
  const partes = CAMPOS_MEDIDA.filter((campo) => medicion[campo.clave] != null).map(
    (campo) =>
      `${campo.etiqueta} ${formatearNumero(Number(medicion[campo.clave]))} ${campo.unidad}`,
  )
  const fotos = fotosDeMedicion(medicion).length
  if (fotos) partes.push(`${fotos} ${fotos === 1 ? 'foto' : 'fotos'}`)
  return partes.join(' · ') || 'Sin datos'
}

function FormularioMedicion({
  clienteId,
  esInicial,
  esProfe,
  alturaAnterior,
  onGuardado,
  onCancelar,
}) {
  const [valores, setValores] = useState({
    fecha: obtenerFechaHoyISO(),
    altura: alturaAnterior || '',
  })
  // Una foto principal por vista ({ frente: File, ... }) y las "otras"
  // (todas las que se quieran: ninguna reemplaza a otra).
  const [fotos, setFotos] = useState({})
  const [otras, setOtras] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  function cambiar(clave, valor) {
    setValores((actual) => ({ ...actual, [clave]: valor }))
  }

  async function guardar(event) {
    event.preventDefault()
    const datos = { fecha: valores.fecha, tipo: esInicial ? 'inicial' : 'control' }
    for (const campo of CAMPOS_MEDIDA) {
      const texto = String(valores[campo.clave] ?? '')
        .replace(',', '.')
        .trim()
      if (texto) datos[campo.clave] = Number(texto)
    }
    if (esInicial && String(valores.altura).trim()) {
      datos.altura = Number(String(valores.altura).replace(',', '.'))
    }
    if (valores.notas?.trim()) datos.notas = valores.notas.trim()
    const archivos = [
      ...VISTAS_FOTO.filter((opcion) => fotos[opcion.clave]).map((opcion) => ({
        vista: opcion.clave,
        archivo: fotos[opcion.clave],
      })),
      ...otras.map((archivo) => ({ vista: CLAVE_OTRAS_FOTOS, archivo })),
    ]
    const hayAlgo =
      CAMPOS_MEDIDA.some((campo) => datos[campo.clave] !== undefined) || archivos.length > 0
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
    const error = await guardarMedicion(clienteId, datos, archivos)
    setGuardando(false)
    if (error) {
      setMensaje(
        error.message?.includes('check')
          ? 'Algún valor está fuera de rango.'
          : error.message || 'No pudimos guardar.',
      )
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

      <p className="editor-rango-etiqueta">
        Fotos de progreso (opcional, solo las ven vos y tu profe)
      </p>
      <div className="medidas-fotos-carga">
        {VISTAS_FOTO.map((opcion) => (
          <div key={opcion.clave} className="medidas-carga-vista">
            {fotos[opcion.clave] ? (
              <MiniaturaArchivo
                archivo={fotos[opcion.clave]}
                etiqueta={opcion.etiqueta}
                onQuitar={() => setFotos((actual) => ({ ...actual, [opcion.clave]: null }))}
              />
            ) : (
              <label className="suscripcion-adjuntar medidas-adjuntar">
                + {opcion.etiqueta}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const archivo = event.target.files?.[0] || null
                    event.target.value = ''
                    setFotos((actual) => ({ ...actual, [opcion.clave]: archivo }))
                  }}
                />
              </label>
            )}
          </div>
        ))}
        {otras.map((archivo, indice) => (
          <div key={`${archivo.name}-${indice}`} className="medidas-carga-vista">
            <MiniaturaArchivo
              archivo={archivo}
              etiqueta="Otra"
              onQuitar={() => setOtras((actual) => actual.filter((_, i) => i !== indice))}
            />
          </div>
        ))}
        <div className="medidas-carga-vista">
          <label className="suscripcion-adjuntar medidas-adjuntar">
            + Otras fotos
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                const elegidas = [...(event.target.files || [])]
                event.target.value = ''
                setOtras((actual) => [...actual, ...elegidas])
              }}
            />
          </label>
        </div>
      </div>
      <p className="profe-nota medidas-nota-fotos">
        Se guardan todas: ninguna foto reemplaza a otra. Después también podés sumar fotos a esta
        fecha desde "Todas las fotos".
      </p>

      <textarea
        className="form-textarea"
        placeholder={
          esProfe ? 'Observaciones (opcional)' : 'Notas (opcional): cómo te sentís, cambios…'
        }
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
