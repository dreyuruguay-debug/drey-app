// Logo DREY animado (las letras se arman solas). Lo usan la página de
// inicio (donde también se inicia sesión) y las pantallas de registrarse
// y contraseña nueva.
//
// La animación es public/drey-logo-animado.webp (pasada del GIF original:
// pesa 64 KB en vez de 1,7 MB y se ve igual). Si el celular tiene pedido
// "reducir movimiento", se muestra el logo quieto (public/drey-logo-quieto.webp).
export default function LogoDrey({ className = 'auth-logo-img', decorativo = false }) {
  return (
    <picture>
      <source srcSet="/drey-logo-quieto.webp" media="(prefers-reduced-motion: reduce)" />
      <img
        src="/drey-logo-animado.webp"
        alt={decorativo ? '' : 'DREY'}
        className={className}
        width="720"
        height="229"
        decoding="async"
      />
    </picture>
  )
}
