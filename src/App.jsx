import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Registro from './pages/Registro.jsx'
import Home from './pages/Home.jsx'
import Rutinas from './pages/Rutinas.jsx'
import RutinaDetalle from './pages/RutinaDetalle.jsx'
import Suscripcion from './pages/Suscripcion.jsx'
import Comunidad from './pages/Comunidad.jsx'
import MisDatos from './pages/MisDatos.jsx'
import Perfil from './pages/Perfil.jsx'
import Progreso from './pages/Progreso.jsx'
import AvisoGlobal from './components/AvisoGlobal.jsx'
import EstadoConexion from './components/EstadoConexion.jsx'
import PantallaError from './components/PantallaError.jsx'
import {
  Legal,
  Medidas,
  NuevaContrasena,
  PanelProfe,
  PrivacidadYDatos,
  ProfeCalendario,
  ProfeClienteDetalle,
  ProfeClienteMedidas,
  ProfeClienteProgreso,
  ProfeClientes,
  ProfeCodigos,
  ProfeCuentas,
  ProfeEjercicios,
  ProfeEquipo,
  ProfeEstadisticas,
  ProfePlantillas,
  ProfeProgresion,
  ProfeRutinaDias,
  ProfeRutinaEditor,
  ProfeRutinaNueva,
  ProfeRutinas,
} from './pantallasDiferidas.js'
import Esqueleto from './components/Esqueleto.jsx'

function CargandoPantalla() {
  return (
    <div className="screen">
      <Esqueleto tipo="pantalla" />
    </div>
  )
}

// Cada pantalla tiene su propio archivo en src/pages.
// PantallaError: si una pantalla se rompe, muestra un mensaje amable en
// vez de quedar en blanco (y avisa por mail, ver services/errores.js).
export default function App() {
  return (
    <BrowserRouter>
      <EstadoConexion />
      <PantallaError>
      <Suspense fallback={<CargandoPantalla />}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="/nueva-contrasena" element={<NuevaContrasena />} />
          <Route path="/inicio" element={<Home />} />
          <Route path="/rutinas" element={<Rutinas />} />
          <Route path="/rutinas/:id" element={<RutinaDetalle />} />
          <Route path="/suscripcion" element={<Suscripcion />} />
          <Route path="/comunidad" element={<Comunidad />} />
          <Route path="/mis-datos" element={<MisDatos />} />
          <Route path="/progreso" element={<Progreso />} />
          <Route path="/medidas" element={<Medidas />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/mi-privacidad" element={<PrivacidadYDatos />} />
          <Route path="/terminos" element={<Legal tipo="terminos" />} />
          <Route path="/privacidad" element={<Legal tipo="privacidad" />} />
          {/* "Más" pasó a llamarse "Perfil". */}
          <Route path="/mas" element={<Navigate to="/perfil" replace />} />
          <Route path="/profe" element={<PanelProfe />} />
          <Route path="/profe/cuentas" element={<ProfeCuentas />} />
          <Route path="/profe/codigos" element={<ProfeCodigos />} />
          <Route path="/profe/estadisticas" element={<ProfeEstadisticas />} />
          <Route path="/profe/equipo" element={<ProfeEquipo />} />
          <Route path="/profe/ejercicios" element={<ProfeEjercicios />} />
          <Route path="/profe/clientes" element={<ProfeClientes />} />
          <Route path="/profe/clientes/:id" element={<ProfeClienteDetalle />} />
          {/* Rutinas: elegir cliente → sus rutinas → asistente paso a paso */}
          <Route path="/profe/rutinas" element={<ProfeRutinas />} />
          <Route
            path="/profe/rutinas/nueva/:clienteId"
            element={<ProfeRutinaNueva tipo="rutina" />}
          />
          <Route path="/profe/rutinas/:id" element={<ProfeRutinaEditor tipo="rutina" />} />
          <Route path="/profe/rutinas/:id/dias" element={<ProfeRutinaDias />} />
          <Route
            path="/profe/rutinas/:id/vista-previa"
            element={<RutinaDetalle modoPrevia tipo="rutina" />}
          />
          {/* Dirección vieja del editor de rutinas (por si quedó guardada en algún lado). */}
          <Route
            path="/profe/clientes/:clienteId/rutinas/:id"
            element={<ProfeRutinaEditor tipo="rutina" />}
          />
          <Route path="/profe/clientes/:id/progreso" element={<ProfeClienteProgreso />} />
          <Route path="/profe/clientes/:id/medidas" element={<ProfeClienteMedidas />} />
          <Route path="/profe/progresion" element={<ProfeProgresion />} />
          <Route path="/profe/calendario" element={<ProfeCalendario />} />
          <Route path="/profe/plantillas" element={<ProfePlantillas />} />
          <Route path="/profe/plantillas/nueva" element={<ProfeRutinaNueva tipo="plantilla" />} />
          <Route path="/profe/plantillas/:id" element={<ProfeRutinaEditor tipo="plantilla" />} />
          <Route
            path="/profe/plantillas/:id/vista-previa"
            element={<RutinaDetalle modoPrevia tipo="plantilla" />}
          />
        </Routes>
      </Suspense>
      </PantallaError>
      <AvisoGlobal />
    </BrowserRouter>
  )
}
