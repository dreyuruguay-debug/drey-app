// Franja decorativa de arriba con el logo DREY repetido. Se usa en todas
// las pantallas del cliente (Inicio, Rutinas, etc.). La tipografía y el
// isotipo exactos del diseño original quedan pendientes de confirmar
// (Fase 0); por ahora se arma con el nombre de la marca y una flecha simple.
export default function TopPattern() {
  const items = Array.from({ length: 14 })
  return (
    <div className="top-pattern" aria-hidden="true">
      {items.map((_, index) => (
        <span key={index} className="top-pattern-item">
          DREY <span className="top-pattern-icon">▷</span>
        </span>
      ))}
    </div>
  )
}
