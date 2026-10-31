import { useEffect } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { esProfeConocido, verificarProfe } from '../services/accesoProfe.js'
import { usuarioGuardado } from '../services/sesion.js'

// Las pantallas del alumno (Inicio, Rutinas, Perfil…) son solo para
// alumnos. Si entra un profe o la cuenta Admin, va a su panel ("/profe").
//
// Por qué hace falta: el profe que cierra la app sin cerrar sesión, al
// otro día puede volver a abrirla directo en una pantalla del alumno
// (la app instalada antes de que abriera en la portada, la pestaña que
// el navegador recuerda, un link guardado…). Antes se quedaba ahí y
// tenía que cerrar sesión y volver a entrar.
//
//   · Si en este celular ya se sabe que es profe: va al panel al instante,
//     sin mostrar nada del alumno.
//   · Si todavía no se sabe: se muestra la pantalla normal (así el alumno
//     no espera, aunque no tenga señal) y, apenas se confirma con el
//     servidor que es profe, pasa al panel.
//   · Sin sesión: cada pantalla ya manda a "Iniciar sesión".
//
// No abre ni cierra ningún acceso a datos (eso lo controla la base de
// datos): solo decide a qué pantalla va cada uno.
export default function SoloAlumnos() {
  const navigate = useNavigate()
  const yaSeSabe = usuarioGuardado() ? esProfeConocido() : null

  useEffect(() => {
    if (yaSeSabe === true || !usuarioGuardado()) return undefined
    let activo = true
    verificarProfe().then(({ usuarioId, esProfe }) => {
      if (activo && usuarioId && esProfe) navigate('/profe', { replace: true })
    })
    return () => {
      activo = false
    }
  }, [yaSeSabe, navigate])

  if (yaSeSabe === true) return <Navigate to="/profe" replace />
  return <Outlet />
}
