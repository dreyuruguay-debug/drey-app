import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { supabase } from './services/supabaseClient.js'
import { iniciarAvisoDeErrores } from './services/errores.js'
import { iniciarEnvioAutomatico } from './services/colaEntrenamientos.js'
import { mostrarAviso } from './services/avisos.js'
import './styles/globals.css'

// Aviso de errores por mail (solo si está configurado, ver errores.js).
iniciarAvisoDeErrores(supabase)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Entrenamientos guardados sin señal: se mandan solos cuando vuelve.
iniciarEnvioAutomatico((cantidad) =>
  mostrarAviso(
    cantidad === 1 ? 'Entrenamiento enviado a tu profe' : `${cantidad} entrenamientos enviados`,
  ),
)

// Registra el service worker (public/sw.js): hace que DREY se pueda
// instalar como app y que abra sin señal. Solo en la web publicada: en
// modo desarrollo se saltea para que siempre se vean los cambios.
// Si falla (navegador viejo) no rompe nada.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
