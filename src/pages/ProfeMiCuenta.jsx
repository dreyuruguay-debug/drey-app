import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import ProfeLayout from '../components/ProfeLayout.jsx'
import InterruptorNotificaciones from '../components/InterruptorNotificaciones.jsx'
import { supabase } from '../services/supabaseClient.js'
import {
  EVENTO_SOLICITUDES,
  contarSolicitudesPendientes,
  esAdminConocido,
  ultimasSolicitudesPendientes,
  verificarProfe,
} from '../services/accesoProfe.js'
import { cargarPerfilDeProfe, perfilCompleto } from '../services/profes.js'
import { RUTA_INGRESAR } from '../data/rutas.js'

// "Mi cuenta" del profe ("/profe/mi-cuenta"): todo lo de su cuenta en un
// solo lugar. En el celular se abre desde el menú de abajo; en la compu
// "Mi perfil" y "Solicitudes" ya están en la barra lateral.
//
//   · Mi perfil de profe (lo que ven los alumnos al elegir profe).
//   · Solicitudes de alumnos (con las que esperan respuesta).
//   · Estadísticas, notificaciones y cerrar sesión.
//
// El Admin no tiene perfil de profe: si entra acá, vuelve a su Inicio.
export default function ProfeMiCuenta() {
  const navigate = useNavigate()
  const [esAdmin, setEsAdmin] = useState(esAdminConocido)
  const [pendientes, setPendientes] = useState(ultimasSolicitudesPendientes)
  const [perfilListo, setPerfilListo] = useState(null) // null = todavía no se sabe

  useEffect(() => {
    let activo = true
    verificarProfe().then(({ esAdmin: admin }) => activo && setEsAdmin(Boolean(admin)))
    contarSolicitudesPendientes().then((cantidad) => activo && setPendientes(cantidad))
    cargarPerfilDeProfe().then(({ perfil }) => activo && setPerfilListo(perfilCompleto(perfil)))
    const alContar = (event) => setPendientes(event.detail)
    window.addEventListener(EVENTO_SOLICITUDES, alContar)
    return () => {
      activo = false
      window.removeEventListener(EVENTO_SOLICITUDES, alContar)
    }
  }, [])

  async function cerrarSesion() {
    await supabase.auth.signOut()
    navigate(RUTA_INGRESAR)
  }

  if (esAdmin) return <Navigate to="/profe" replace />

  const opciones = [
    {
      to: '/profe/mi-perfil',
      titulo: 'Mi perfil de profe',
      detalle:
        perfilListo === false
          ? 'Falta completarlo: los alumnos lo ven para elegirte'
          : 'Foto, especialidades y descripción que ven los alumnos',
      destacar: perfilListo === false,
    },
    {
      to: '/profe/solicitudes',
      titulo: 'Solicitudes de alumnos',
      detalle:
        pendientes > 0
          ? `${pendientes} ${pendientes === 1 ? 'espera' : 'esperan'} tu respuesta`
          : 'No hay solicitudes esperando respuesta',
      destacar: pendientes > 0,
    },
    {
      to: '/profe/estadisticas',
      titulo: 'Estadísticas',
      detalle: 'Clientes activos, bajas e ingresos del mes',
    },
  ]

  return (
    <ProfeLayout titulo="Mi cuenta">
      <nav className="lista-tarjetas" aria-label="Opciones de tu cuenta">
        {opciones.map((opcion) => (
          <Link
            key={opcion.to}
            to={opcion.to}
            className={opcion.destacar ? 'tarjeta-rutina tarjeta-destacada' : 'tarjeta-rutina'}
          >
            <span className="tarjeta-rutina-textos">
              <strong>{opcion.titulo}</strong>
              <small>{opcion.detalle}</small>
            </span>
            <span className="tarjeta-flecha" aria-hidden="true">
              ›
            </span>
          </Link>
        ))}
        <InterruptorNotificaciones textoActivar="Te avisamos en este celular cuando un alumno te pide entrenar con vos, cuando alguien se registra, avisa que pagó o paga con Mercado Pago." />
      </nav>

      <button type="button" className="boton-texto perfil-salir" onClick={cerrarSesion}>
        Cerrar sesión
      </button>
    </ProfeLayout>
  )
}
