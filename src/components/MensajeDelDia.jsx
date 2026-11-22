import { useEffect, useState } from 'react'
import AdornoDeFiesta from './AdornoDeFiesta.jsx'
import { cargarMensajesDeHoy } from '../services/mensajesProfe.js'
import { marcarVistos, mensajesParaMostrar, sinVer } from '../utils/mensajesDelDia.js'
import { fiestaDelDia } from '../data/fiestas.js'
import { obtenerFechaHoyISO } from '../utils/dias.js'

// El mensaje grande que el alumno ve al abrir la app (Inicio): lo que su
// profe escribió para hoy (pages/ProfeMensajes.jsx), para todos sus
// alumnos o solo para él. Aparece una vez por día a pantalla completa; si
// hay más de uno, pasan de a uno con "Siguiente".
//
// En las fiestas (data/fiestas.js: Navidad, fin de año, Año Nuevo) el
// cartel lleva el adorno de la fiesta y, si el profe no escribió nada,
// trae el saludo de la fiesta firmado con su nombre. Esos días, además,
// queda un adorno chico en una esquina de Inicio.
//
// Sin señal no muestra nada (nunca es un error para el alumno).
//   activo: false mientras no corresponde mostrarlo (cuenta pendiente o
//   dada de baja, o con la bienvenida abierta).
export default function MensajeDelDia({ activo = true }) {
  const hoy = obtenerFechaHoyISO()
  const fiesta = fiestaDelDia(hoy)
  const [pendientes, setPendientes] = useState([])

  useEffect(() => {
    if (!activo) return undefined
    let vigente = true
    cargarMensajesDeHoy().then((datos) => {
      if (!vigente) return
      // Sin respuesta de la base: en una fiesta igual va el saludo.
      const lista = mensajesParaMostrar(datos || { mensajes: [], profe: null }, hoy)
      setPendientes(sinVer(lista, hoy))
    })
    return () => {
      vigente = false
    }
  }, [activo, hoy])

  const mensaje = pendientes[0]

  function cerrar() {
    marcarVistos([mensaje.id], hoy)
    setPendientes((lista) => lista.slice(1))
  }

  return (
    <>
      {activo && fiesta && !mensaje && (
        <AdornoDeFiesta dibujo={fiesta.dibujo} tamano={72} className="adorno-fiesta-esquina" />
      )}
      {activo && mensaje && (
        <div
          className={mensaje.fiesta ? 'mensaje-dia mensaje-dia-fiesta' : 'mensaje-dia'}
          role="dialog"
          aria-modal="true"
          aria-label={mensaje.titulo}
        >
          <div className="mensaje-dia-contenido">
            {mensaje.fiesta ? (
              <AdornoDeFiesta dibujo={mensaje.fiesta.dibujo} tamano={128} />
            ) : (
              <span className="mensaje-dia-marca">DREY</span>
            )}
            <span className="mensaje-dia-titulo">{mensaje.titulo}</span>
            <p className="mensaje-dia-texto">{mensaje.texto}</p>
            <span className="mensaje-dia-firma">— {mensaje.firma}</span>
          </div>
          <button type="button" className="boton-principal" onClick={cerrar}>
            {pendientes.length > 1 ? `Siguiente (${pendientes.length - 1} más)` : '¡Vamos!'}
          </button>
        </div>
      )}
    </>
  )
}
