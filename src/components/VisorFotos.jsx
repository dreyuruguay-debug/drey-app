import { useNavegacionVisor } from './useNavegacionVisor.js'

// Fotos de progreso a pantalla completa, con anterior / siguiente
// (flechas, teclado o deslizando el dedo). Mismo estilo que el visor de
// los ejercicios (components/VisorEjercicios.jsx).
//
// fotos: [{ url, titulo, detalle }]. indice: cuál se muestra.
// acciones(foto, indice): botones extra abajo (por ejemplo "Borrar esta foto").
export default function VisorFotos({ fotos, indice, onCambiar, onCerrar, acciones }) {
  const foto = fotos[indice]
  const { hayAnterior, haySiguiente, gestos } = useNavegacionVisor({
    cantidad: fotos.length,
    indice,
    onCambiar,
    onCerrar,
    siguienteUrl: fotos[indice + 1]?.url,
  })

  if (!foto) return null

  return (
    <div className="visor-fondo" onClick={onCerrar} role="presentation">
      <div
        className="visor-caja"
        role="dialog"
        aria-modal="true"
        aria-label={foto.titulo}
        onClick={(event) => event.stopPropagation()}
        {...gestos}
      >
        <div className="visor-cabecera">
          <span className="visor-contador">
            {indice + 1} de {fotos.length}
          </span>
          <button type="button" className="visor-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="visor-imagen visor-imagen-foto">
          <button
            type="button"
            className="visor-flecha visor-flecha-anterior"
            onClick={() => onCambiar(indice - 1)}
            disabled={!hayAnterior}
            aria-label="Foto anterior"
          >
            ‹
          </button>
          {foto.url ? (
            <img key={foto.url} src={foto.url} alt={foto.titulo} />
          ) : (
            <span className="visor-sin-foto">Foto no disponible</span>
          )}
          <button
            type="button"
            className="visor-flecha visor-flecha-siguiente"
            onClick={() => onCambiar(indice + 1)}
            disabled={!haySiguiente}
            aria-label="Foto siguiente"
          >
            ›
          </button>
        </div>

        <p className="visor-nombre">{foto.titulo}</p>
        {foto.detalle && <p className="visor-detalle">{foto.detalle}</p>}

        <div className="visor-acciones">
          {acciones?.(foto, indice)}
          <button type="button" className="boton-secundario" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        {fotos.length > 1 && (
          <p className="visor-ayuda">
            Deslizá o usá las flechas para ver la anterior o la siguiente.
          </p>
        )}
      </div>
    </div>
  )
}
