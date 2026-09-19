import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Registro from './pages/Registro.jsx'
import Home from './pages/Home.jsx'
import Rutinas from './pages/Rutinas.jsx'
import RutinaDetalle from './pages/RutinaDetalle.jsx'
import Suscripcion from './pages/Suscripcion.jsx'
import Comunidad from './pages/Comunidad.jsx'
import MisDatos from './pages/MisDatos.jsx'
import Mas from './pages/Mas.jsx'
import PanelProfe from './pages/PanelProfe.jsx'
import ProfeCuentas from './pages/ProfeCuentas.jsx'
import ProfeEjercicios from './pages/ProfeEjercicios.jsx'
import ProfeClientes from './pages/ProfeClientes.jsx'
import ProfeClienteDetalle from './pages/ProfeClienteDetalle.jsx'

// Cada pantalla del plan tiene su propia carpeta/archivo en src/pages.
// Inicio, Rutinas, el detalle de una rutina y Login ya tienen su
// contenido real; el resto se va a ir completando pantalla por pantalla.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/registro" element={<Registro />} />
        <Route path="/inicio" element={<Home />} />
        <Route path="/rutinas" element={<Rutinas />} />
        <Route path="/rutinas/:id" element={<RutinaDetalle />} />
        <Route path="/suscripcion" element={<Suscripcion />} />
        <Route path="/comunidad" element={<Comunidad />} />
        <Route path="/mis-datos" element={<MisDatos />} />
        <Route path="/mas" element={<Mas />} />
        <Route path="/profe" element={<PanelProfe />} />
        <Route path="/profe/cuentas" element={<ProfeCuentas />} />
        <Route path="/profe/ejercicios" element={<ProfeEjercicios />} />
        <Route path="/profe/clientes" element={<ProfeClientes />} />
        <Route path="/profe/clientes/:id" element={<ProfeClienteDetalle />} />
      </Routes>
    </BrowserRouter>
  )
}
