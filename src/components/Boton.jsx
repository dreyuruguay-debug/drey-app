// Ejemplo de componente reutilizable: un botón con el estilo de DREY
// (fondo negro, acento verde). Los botones de "Rutinas", "Suscripción",
// etc. de la pantalla de Inicio van a usar algo como esto.
export default function Boton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--drey-accent)',
        color: 'var(--drey-black)',
        border: 'none',
        borderRadius: '8px',
        padding: '0.75rem 1.5rem',
        fontWeight: 'bold',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
