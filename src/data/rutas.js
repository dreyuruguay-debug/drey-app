// Direcciones de las pantallas de entrada. Están en un solo lugar porque
// muchas pantallas mandan a "Iniciar sesión" cuando no hay sesión.
//
//   · "/"          → la página de inicio (pages/Portada.jsx).
//   · "/ingresar"  → la misma página de inicio, con el formulario para
//                    iniciar sesión ya abierto arriba (sobre el video).
export const RUTA_PORTADA = '/'
export const RUTA_INGRESAR = '/ingresar'

// Formas de ver la página de inicio con la sesión abierta ("/?vista=…").
// Sin esto, quien ya inició sesión va directo a su pantalla.
//   · previa: el Admin la ve como alguien sin cuenta (Ajustes → Portada).
//   · portada: alguien se la muestra a un amigo sin cerrar sesión (Perfil
//     → "Mostrar DREY a un amigo"); ve "Volver a mi cuenta" y "Compartir".
export const VISTA_PREVIA = 'previa'
export const VISTA_MOSTRAR = 'portada'
export const RUTA_VISTA_PREVIA = `${RUTA_PORTADA}?vista=${VISTA_PREVIA}`
export const RUTA_MOSTRAR_PORTADA = `${RUTA_PORTADA}?vista=${VISTA_MOSTRAR}`
