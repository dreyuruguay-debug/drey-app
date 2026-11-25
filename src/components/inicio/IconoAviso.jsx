import Icono from '../Icono.jsx'

// Ícono de un aviso del Inicio del alumno (el carrusel y la campanita).
// Los dibujos están en components/Icono.jsx, con los demás de DREY.
export default function IconoAviso({ tipo, tamano = 20 }) {
  return <Icono nombre={tipo} tamano={tamano} />
}
