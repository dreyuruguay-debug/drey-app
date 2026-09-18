// Ícono de perfil genérico (silueta), hasta tener la foto real del
// cliente. "size" permite reutilizarlo más chico (por ejemplo en el
// saludo de Inicio) sin tener que crear un componente aparte.
export default function ProfileIcon({ size = 72 }) {
  return (
    <div className="profile-avatar" style={{ width: size, height: size }}>
      <div className="profile-avatar-head" />
      <div className="profile-avatar-body" />
    </div>
  )
}
