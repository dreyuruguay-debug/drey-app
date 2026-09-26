// Solo las partes de Sentry que usa DREY (errores.js carga este archivo
// aparte). Importarlas por nombre deja afuera todo lo demás de Sentry
// (grabación de pantalla, métricas...) y la descarga es mucho más chica.
export { captureException, init, setUser } from '@sentry/browser'
