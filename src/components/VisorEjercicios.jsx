import { useEffect, useRef } from 'react'
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
  const inicioToque = useRef(null)
  const hayAnterior = indice > 0
  const haySiguiente = indice < ejercicios.length - 1

  // Mientras está abierto, la página de atrás no se mueve.
  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [])

  useEffect(() => {
    function alApretarTecla(event) {
      if (event.key === 'Escape') onCerrar()
      if (event.key === 'ArrowLeft' && hayAnterior) onCambiar(indice - 1)
      if (event.key === 'ArrowRight' && haySiguiente) onCambiar(indice + 1)
    }
    window.addEventListener('keydown', alApretarTecla)
    return () => window.removeEventListener('keydown', alApretarTecla)
  }, [indice, hayAnterior, haySiguiente, onCambiar, onCerrar])

  // El siguiente se va descargando mientras se mira este.
  useEffect(() => {
    const siguiente = ejercicios[indice + 1]?.imagen_url
    if (siguiente) new Image().src = siguiente
  }, [ejercicios, indice])

  if (!ejercicio) return null

  function alTocar(event) {
    inicioToque.current = event.touches[0]?.clientX ?? null
  }

  function alSoltar(event) {
    if (inicioToque.current === null) return
    const distancia = (event.changedTouches[0]?.clientX ?? 0) - inicioToque.current
    inicioToque.current = null
    if (distancia > 50 && hayAnterior) onCambiar(indice - 1)
    if (distancia < -50 && haySiguiente) onCambiar(indice + 1)
  }

  const categorias = categoriasDeEjercicio(ejercicio)

  return (
    <div className="visor-fondo" onClick={onCerrar} role="presentation">
      <div
        className="visor-caja"
        role="dialog"
        aria-modal="true"
        aria-label={`Animación de ${ejercicio.nombre}`}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={alTocar}
        onTouchEnd={alSoltar}
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
        <p className="visor-detalle">
          {[ejercicio.grupo_muscular, ...categorias].filter(Boolean).join(' · ')}
        </p>
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
        <p className="visor-ayuda">
          Deslizá o usá las flechas para ver el anterior o el siguiente.
        </p>
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
