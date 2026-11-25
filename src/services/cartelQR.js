import { descargarBlob } from '../utils/descargas.js'
import { linkDeRegistro } from './espacio.js'

// Cartel para imprimir y pegar en la recepción del gimnasio (o en el
// consultorio del profe): el logo de DREY, "Entrená con … en DREY" y un QR
// grande. Al escanearlo con la cámara del celular se abre el registro de
// alumno con el código del espacio ya puesto (/registro/alumno?espacio=…).
// Abajo, por si alguien no puede escanear, la dirección y el código.
//
// Arma un PDF tamaño A4 y lo descarga. Las librerías (jspdf y qrcode) se
// bajan recién al tocar el botón, así no pesan en el resto de la app.
//   espacio: { nombre, codigo, tipo } (services/espacio.js).
//   nombre:  cómo se presenta ("FitCenter" o el nombre del profe).
const NEGRO = [13, 13, 13]
const VERDE = [61, 220, 132]
const GRIS = [95, 100, 96]

export async function descargarCartel({ nombre, codigo }) {
  const link = linkDeRegistro(codigo)
  const [{ jsPDF }, { default: QRCode }, logo] = await Promise.all([
    import('jspdf'),
    import('qrcode'),
    cargarImagen('/drey-logo.png'),
  ])
  const qr = await QRCode.toDataURL(link, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 1200,
    color: { dark: '#0d0d0dff', light: '#ffffffff' },
  })

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const ancho = pdf.internal.pageSize.getWidth() // 210
  const centro = ancho / 2

  // Franja negra de arriba con el logo blanco y la línea verde.
  pdf.setFillColor(...NEGRO)
  pdf.rect(0, 0, ancho, 62, 'F')
  pdf.setFillColor(...VERDE)
  pdf.rect(0, 62, ancho, 2.5, 'F')
  if (logo) {
    const altoLogo = 18
    const anchoLogo = (logo.width / logo.height) * altoLogo
    pdf.addImage(logo.datos, 'PNG', centro - anchoLogo / 2, 22, anchoLogo, altoLogo)
  }

  // Título y bajada.
  pdf.setTextColor(...NEGRO)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(28)
  pdf.text(dividir(pdf, `Entrená con ${nombre} en DREY`, ancho - 40), centro, 86, {
    align: 'center',
  })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(14)
  pdf.setTextColor(...GRIS)
  pdf.text('Tu rutina, tus marcas y tu progreso en el celular.', centro, 106, { align: 'center' })

  // El QR, grande y centrado, con un marco verde.
  const lado = 110
  const arriba = 118
  pdf.setDrawColor(...VERDE)
  pdf.setLineWidth(1.5)
  pdf.roundedRect(centro - lado / 2 - 6, arriba - 6, lado + 12, lado + 12, 6, 6, 'S')
  pdf.addImage(qr, 'PNG', centro - lado / 2, arriba, lado, lado)

  // Cómo usarlo.
  pdf.setTextColor(...NEGRO)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.text('Escaneá el código con la cámara del celular', centro, arriba + lado + 22, {
    align: 'center',
  })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(12)
  pdf.setTextColor(...GRIS)
  pdf.text(
    `o entrá a ${window.location.host}/registro y poné el código`,
    centro,
    arriba + lado + 33,
    {
      align: 'center',
    },
  )
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(24)
  pdf.setTextColor(...NEGRO)
  pdf.text(codigo, centro, arriba + lado + 47, { align: 'center' })

  // Pie.
  pdf.setFillColor(...NEGRO)
  pdf.rect(0, 282, ancho, 15, 'F')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(255, 255, 255)
  pdf.text('DREY · seguimiento de entrenamiento', centro, 291, { align: 'center' })

  descargarBlob(pdf.output('blob'), `Cartel DREY - ${nombre}.pdf`)
}

// Parte el título en renglones si no entra en el ancho.
function dividir(pdf, texto, anchoMaximo) {
  return pdf.splitTextToSize(texto, anchoMaximo)
}

// El logo (blanco) sobre el negro de la franja, como imagen para el PDF
// (o null si no se pudo cargar: el cartel sale igual, sin logo).
function cargarImagen(ruta) {
  return new Promise((resolver) => {
    const imagen = new Image()
    imagen.onload = () => {
      const lienzo = document.createElement('canvas')
      lienzo.width = imagen.naturalWidth
      lienzo.height = imagen.naturalHeight
      const dibujo = lienzo.getContext('2d')
      dibujo.drawImage(imagen, 0, 0)
      // El logo es blanco sobre un fondo casi negro: se pasa al negro de la
      // franja (según cuán claro es cada punto), así no queda un recuadro.
      const puntos = dibujo.getImageData(0, 0, lienzo.width, lienzo.height)
      const pixeles = puntos.data
      for (let i = 0; i < pixeles.length; i += 4) {
        const luz =
          ((pixeles[i] + pixeles[i + 1] + pixeles[i + 2]) / 3 / 255) * (pixeles[i + 3] / 255)
        const valor = Math.round(NEGRO[0] + (255 - NEGRO[0]) * luz)
        pixeles[i] = valor
        pixeles[i + 1] = valor
        pixeles[i + 2] = valor
        pixeles[i + 3] = 255
      }
      dibujo.putImageData(puntos, 0, 0)
      resolver({ datos: lienzo.toDataURL('image/png'), width: lienzo.width, height: lienzo.height })
    }
    imagen.onerror = () => resolver(null)
    imagen.src = ruta
  })
}
