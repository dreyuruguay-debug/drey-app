// Franja decorativa de arriba con el logo DREY repetido, en
// movimiento constante (un simple detalle visual, no interactivo). Se
// usa en todas las pantallas del cliente y del profe (Inicio, Rutinas,
// panel del profe, etc.).
//
// La imagen "drey-tile.png" es un solo recorte del logo que se repite
// como fondo (background-repeat) y se anima desplazando esa imagen de
// fondo — así el loop queda perfecto sin importar el ancho de pantalla.
export default function TopPattern() {
  return <div className="top-pattern" aria-hidden="true" />
}
