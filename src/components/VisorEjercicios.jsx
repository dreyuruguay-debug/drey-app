import { useNavegacionVisor } from './useNavegacionVisor.js'
import { categoriasDeEjercicio } from '../data/categorias.js'
import { miniaturaDeEjercicio } from '../utils/imagenes.js'

// Ver la animación (GIF) de un ejercicio en grande, para revisar que sea
// la correcta. Se abre tocando la foto chica de la lista (Biblioteca y
// selector de ejercicios del editor de rutinas).
//
// Se puede pasar al anterior / siguiente de la misma lista sin cerrar:
// con las flechas de la pantalla, las del teclado (en la compu) o
// deslizando el dedo (en el celular). Esc o tocar afuera cierra.
//
// ejercicios: la lista que se está viendo (solo los que tienen foto).
// indice: cuál se muestra. onCambiar(indice) / onCerrar().
// acciones(ejercicio): botones extra abajo (por ejemplo "Editar").
export default function VisorEjercicios({ ejercicios, indice, onCambiar, onCerrar, acciones }) {
  const ejercicio = ejercicios[indice]
  const { hayAnterior, haySiguiente, gestos } = useNavegacionVisor({
    cantidad: ejercicios.length,
    indice,
    onCambiar,
    onCerrar,
    siguienteUrl: ejercicios[indice + 1]?.imagen_url,
  })

  if (!ejercicio) return null

  // Sin repetir el grupo muscular si también es la categoría.
  const categorias = categoriasDeEjercicio(ejercicio).filter(
    (categoria) => categoria !== ejercicio.grupo_muscular,
  )

  return (
    <div className="visor-fondo" onClick={onCerrar} role="presentation">
      <div
        className="visor-caja"
        role="dialog"
        aria-modal="true"
        aria-label={`Animación de ${ejercicio.nombre}`}
        onClick={(event) => event.stopPropagation()}
        {...gestos}
      >
        <div className="visor-cabecera">
          <span className="visor-contador">
            {indice + 1} de {ejercicios.length}
          </span>
          <button type="button" className="visor-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="visor-imagen">
          <button
            type="button"
            className="visor-flecha visor-flecha-anterior"
            onClick={() => onCambiar(indice - 1)}
            disabled={!hayAnterior}
            aria-label="Ejercicio anterior"
          >
            ‹
          </button>
          {/* La foto chica se ve al instante; la animación la reemplaza al llegar. */}
          <img
            key={ejercicio.id}
            src={ejercicio.imagen_url}
            alt={`Cómo se hace: ${ejercicio.nombre}`}
            style={{ backgroundImage: `url("${miniaturaDeEjercicio(ejercicio.imagen_url)}")` }}
          />
          <button
            type="button"
            className="visor-flecha visor-flecha-siguiente"
            onClick={() => onCambiar(indice + 1)}
            disabled={!haySiguiente}
            aria-label="Ejercicio siguiente"
          >
            ›
          </button>
        </div>

        <p className="visor-nombre">{ejercicio.nombre}</p>
        {[ejercicio.grupo_muscular, ...categorias].some(Boolean) && (
          <p className="visor-detalle">
            {[ejercicio.grupo_muscular, ...categorias].filter(Boolean).join(' · ')}
          </p>
        )}
        {ejercicio.video_url && (
          <a className="visor-video" href={ejercicio.video_url} target="_blank" rel="noreferrer">
            Ver video ↗
          </a>
        )}

        <div className="visor-acciones">
          {acciones?.(ejercicio)}
          <button type="button" className="boton-secundario" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        {ejercicios.length > 1 && (
          <p className="visor-ayuda">
            Deslizá o usá las flechas para ver el anterior o el siguiente.
          </p>
        )}
      </div>
    </div>
  )
}

// La foto chica de la lista, como botón que abre el visor.
export function MiniaturaEjercicio({ ejercicio, onAbrir }) {
  return (
    <button
      type="button"
      className="miniatura-boton"
      onClick={onAbrir}
      aria-label={`Ver en grande: ${ejercicio.nombre}`}
      title="Ver en grande"
    >
      <img
        src={miniaturaDeEjercicio(ejercicio.imagen_url)}
        alt=""
        className="profe-ejercicio-foto-mini"
        width="48"
        height="48"
        loading="lazy"
        decoding="async"
      />
      <span className="miniatura-lupa" aria-hidden="true">
        ⤢
      </span>
    </button>
  )
}
