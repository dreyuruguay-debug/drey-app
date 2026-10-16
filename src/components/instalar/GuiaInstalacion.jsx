import HojaInferior from '../HojaInferior.jsx'
import { mostrarAviso } from '../../services/avisos.js'
import { esIOS, instalarConUnToque, useInstalacion } from '../../services/instalacion.js'
import {
  DibujoInterruptor,
  IconoAbrirAfuera,
  IconoAgregar,
  IconoCompartir,
  IconoDrey,
  IconoInstalar,
  IconoPuntos,
  IconoPuntosVerticales,
  IconoRayitas,
  IconoSafari,
  TelefonoConMarca,
} from './Dibujos.jsx'

// Guía paso a paso, con dibujos, para instalar DREY en el celular. Se
// abre desde la tarjeta del Inicio (TarjetaInstalar.jsx), desde Perfil /
// Mi cuenta (OpcionInstalar.jsx) y desde "Notificaciones" en un iPhone
// sin la app instalada (InterruptorNotificaciones.jsx).
//
// Los pasos dependen del celular y del navegador (services/instalacion.js):
// iPhone con Safari (con el menú nuevo de Safari 26 o el de antes),
// iPhone con otro navegador, Android, o dentro de Instagram/Facebook.
//
//   abierta, onCerrar: si se ve y cómo se cierra.
export default function GuiaInstalacion({ abierta, onCerrar }) {
  const info = useInstalacion()
  const guia = armarGuia(info)

  async function instalarAhora() {
    const resultado = await instalarConUnToque()
    if (resultado === 'instalada') {
      mostrarAviso('¡Listo! DREY quedó instalada')
      onCerrar()
    }
  }

  return (
    <HojaInferior abierta={abierta} onCerrar={onCerrar} titulo="Instalar DREY" id="guia-instalar">
      <div className="instalar-guia">
        {guia.intro && <p className="instalar-guia-intro">{guia.intro}</p>}

        {info.estado === 'un-toque' && (
          <button type="button" className="boton-principal" onClick={instalarAhora}>
            <IconoInstalar />
            Instalar DREY
          </button>
        )}

        {guia.pasos.length > 0 && (
          <ol className="instalar-pasos">
            {guia.pasos.map((paso, indice) => (
              <li key={paso.titulo} className="instalar-paso">
                <span className="instalar-paso-numero" aria-hidden="true">
                  {indice + 1}
                </span>
                <div className="instalar-paso-textos">
                  <strong>{paso.titulo}</strong>
                  {paso.detalle && <small>{paso.detalle}</small>}
                </div>
                {paso.dibujo && <span className="instalar-paso-dibujo">{paso.dibujo}</span>}
              </li>
            ))}
          </ol>
        )}

        {guia.copiarLink && (
          <button type="button" className="boton-secundario" onClick={copiarLink}>
            Copiar el link de DREY
          </button>
        )}

        {guia.notas.map((nota) => (
          <p key={nota} className="instalar-guia-nota">
            {nota}
          </p>
        ))}
      </div>
    </HojaInferior>
  )
}

async function copiarLink() {
  const link = `${window.location.origin}/`
  try {
    await navigator.clipboard.writeText(link)
    mostrarAviso('Link copiado')
  } catch {
    // Sin permiso para copiar: se muestra el link para copiarlo a mano.
    mostrarAviso(`Copiá este link: ${link}`)
  }
}

// ---------- Los pasos de cada caso ----------

const PASO_ABRIR_DESDE_ICONO_IOS = {
  titulo: 'Abrí DREY desde el ícono nuevo',
  detalle: 'Está en tu pantalla de inicio. La primera vez vas a tener que iniciar sesión de nuevo.',
  dibujo: <IconoDrey />,
}

const PASO_ABRIR_DESDE_ICONO = {
  titulo: 'Abrí DREY desde el ícono nuevo',
  detalle: 'Está en tu pantalla de inicio, junto a tus otras apps.',
  dibujo: <IconoDrey />,
}

// Safari 26 o más nuevo: Compartir está dentro del menú "···".
const PASOS_SAFARI_NUEVO = [
  {
    titulo: 'Tocá los tres puntitos',
    detalle: 'Están en la barra de la dirección, a la derecha.',
    dibujo: (
      <>
        <TelefonoConMarca lugar="abajo-derecha" />
        <IconoPuntos />
      </>
    ),
  },
  { titulo: 'Tocá «Compartir»', dibujo: <IconoCompartir /> },
  {
    titulo: 'Tocá «Agregar a inicio»',
    detalle: 'Si no lo ves, deslizá hacia abajo o tocá «Ver más».',
    dibujo: <IconoAgregar />,
  },
  {
    titulo: 'Dejá prendido «Abrir como app web» y tocá «Agregar»',
    dibujo: <DibujoInterruptor />,
  },
  PASO_ABRIR_DESDE_ICONO_IOS,
]

// Safari de antes (iOS 16 a 18): botón Compartir en la barra de abajo.
const PASOS_SAFARI = [
  {
    titulo: 'Tocá el botón Compartir',
    detalle: 'El cuadradito con la flecha, en la barra de abajo (en iPad, arriba).',
    dibujo: (
      <>
        <TelefonoConMarca lugar="abajo-centro" />
        <IconoCompartir />
      </>
    ),
  },
  {
    titulo: 'Deslizá hacia abajo y tocá «Agregar a inicio»',
    dibujo: <IconoAgregar />,
  },
  { titulo: 'Tocá «Agregar», arriba a la derecha' },
  PASO_ABRIR_DESDE_ICONO_IOS,
]

const PASOS_CHROME_ANDROID = [
  {
    titulo: 'Tocá los tres puntitos',
    detalle: 'Arriba a la derecha.',
    dibujo: (
      <>
        <TelefonoConMarca lugar="arriba-derecha" />
        <IconoPuntosVerticales />
      </>
    ),
  },
  {
    titulo: 'Tocá «Instalar aplicación»',
    detalle: 'En algunos celulares dice «Agregar a la pantalla principal».',
    dibujo: <IconoInstalar />,
  },
  { titulo: 'Confirmá con «Instalar»' },
  PASO_ABRIR_DESDE_ICONO,
]

const PASOS_SAMSUNG = [
  {
    titulo: 'Tocá el menú',
    detalle: 'Las tres rayitas, abajo a la derecha.',
    dibujo: (
      <>
        <TelefonoConMarca lugar="abajo-derecha" />
        <IconoRayitas />
      </>
    ),
  },
  { titulo: 'Tocá «Agregar página a»', dibujo: <IconoAgregar /> },
  { titulo: 'Elegí «Pantalla de inicio» y confirmá' },
  PASO_ABRIR_DESDE_ICONO,
]

// Ya en el navegador, DREY le muestra la tarjeta para instalar en el Inicio.
const PASO_SEGUIR_EN_EL_NAVEGADOR = {
  titulo: 'Entrá con tu usuario y tocá «Instalar DREY»',
  detalle: 'Está en el Inicio; ahí te muestra los pasos.',
}

// iPhone con Chrome, Firefox...: se instala desde Safari.
const PASOS_IOS_OTRO = [
  { titulo: 'Copiá el link de DREY', detalle: 'Con el botón de acá abajo.' },
  {
    titulo: 'Abrí Safari, pegá el link y entrá',
    dibujo: <IconoSafari />,
  },
  PASO_SEGUIR_EN_EL_NAVEGADOR,
]

function pasosAbrirAfuera() {
  const ios = esIOS()
  return [
    {
      titulo: 'Tocá los tres puntitos',
      detalle: 'Arriba a la derecha.',
      dibujo: (
        <>
          <TelefonoConMarca lugar="arriba-derecha" />
          {ios ? <IconoPuntos /> : <IconoPuntosVerticales />}
        </>
      ),
    },
    {
      titulo: ios ? 'Tocá «Abrir en Safari»' : 'Tocá «Abrir en Chrome»',
      detalle: 'O «Abrir en el navegador», según la app.',
      dibujo: <IconoAbrirAfuera />,
    },
    PASO_SEGUIR_EN_EL_NAVEGADOR,
  ]
}

// Arma el texto de arriba, los pasos y las notas de abajo según el caso.
function armarGuia(info) {
  const notas = []
  if (esIOS()) {
    notas.push(
      'En iPhone, los avisos de DREY llegan solo si la abrís desde el ícono. Cuando entres, activalos en Perfil → Activar notificaciones.',
    )
    if (info.sinAvisos) {
      notas.push(
        'Tu iPhone necesita iOS 16.4 o más nuevo para recibir avisos: Ajustes → General → Actualización de software.',
      )
    }
  }

  switch (info.estado) {
    case 'un-toque':
      return {
        intro: `Se instala con un toque y queda en tu ${info.dispositivo === 'compu' ? 'compu' : 'pantalla de inicio'}, como cualquier app.`,
        pasos: [],
        notas,
      }
    case 'ios-safari':
      return {
        intro: 'Apple no deja instalar con un botón: son unos pocos toques en Safari.',
        pasos: info.menuNuevo ? PASOS_SAFARI_NUEVO : PASOS_SAFARI,
        notas,
      }
    case 'ios-otro':
      return {
        intro: 'En iPhone, DREY se instala desde Safari.',
        pasos: PASOS_IOS_OTRO,
        copiarLink: true,
        notas,
      }
    case 'navegador-de-app':
      return {
        intro:
          'Estás viendo DREY dentro de otra app (Instagram, Facebook…). Desde ahí no se puede instalar: primero abrila en el navegador.',
        pasos: pasosAbrirAfuera(),
        copiarLink: true,
        notas,
      }
    case 'android':
      return {
        intro: 'Son unos pocos toques en el navegador.',
        pasos: info.samsung ? PASOS_SAMSUNG : PASOS_CHROME_ANDROID,
        notas: [
          ...notas,
          'Si abriste DREY desde WhatsApp y no ves «Instalar aplicación», primero tocá «Abrir en Chrome».',
        ],
      }
    case 'instalada-aparte':
      return {
        intro: `DREY ya está instalada en este ${info.dispositivo}. Buscá el ícono en tu pantalla de inicio (o entre tus apps) y abrila desde ahí.`,
        pasos: [{ ...PASO_ABRIR_DESDE_ICONO, titulo: 'Buscá este ícono' }],
        notas,
      }
    case 'instalada':
      return {
        intro: 'DREY ya está instalada y la estás usando como app. ¡Listo!',
        pasos: [],
        notas: [],
      }
    default:
      return {
        intro: 'Abrí DREY en tu celular para instalarla: desde ahí te mostramos los pasos.',
        pasos: [],
        copiarLink: true,
        notas: [],
      }
  }
}
