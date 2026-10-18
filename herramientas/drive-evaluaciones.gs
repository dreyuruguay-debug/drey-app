/**
 * DREY · Guardar evaluaciones en Google Drive
 * =============================================================
 * Programa de Google (Apps Script) que recibe el PDF de una evaluación
 * desde DREY y lo guarda en la carpeta del alumno, dentro de la carpeta
 * "Clientes evaluaciones". Si el alumno todavía no tiene carpeta, la crea
 * con su nombre. Si ya había un PDF con el mismo nombre, lo reemplaza
 * (el viejo va a la papelera).
 *
 * Se instala UNA vez, con la cuenta de Google dueña de la carpeta (ver
 * LEEME). Los PDF quedan a nombre de esa cuenta.
 *
 * La carpeta de cada alumno se reconoce por su número de DREY (queda
 * anotado en la descripción de la carpeta): si el alumno cambia de
 * nombre, sigue usando la misma. Las carpetas que ya existían con el
 * nombre del alumno también se usan.
 */

// Carpeta "Clientes evaluaciones" (lo que va después de /folders/ en el link).
var CARPETA_PRINCIPAL = '1xAC3M8jjQSttSzwopCWjUyC9_di3fLH5';

// La misma clave que se pega en DREY → Ajustes → Drive.
var CLAVE = 'PEGAR-ACA-LA-CLAVE';

function doPost(e) {
  try {
    var pedido = JSON.parse(e.postData.contents);
    if (!pedido || pedido.clave !== CLAVE) return responder({ ok: false, error: 'clave' });

    var principal = carpetaPrincipal();
    if (!principal) return responder({ ok: false, error: 'carpeta' });

    if (pedido.accion === 'probar') {
      return responder({ ok: true, carpeta: principal.getName(), carpetaUrl: principal.getUrl() });
    }

    if (pedido.accion === 'guardar') {
      var carpeta = carpetaDelAlumno(principal, pedido.alumnoId, pedido.carpeta);
      var nombre = limpiar(pedido.archivo) || 'Evaluación DREY.pdf';
      var anteriores = carpeta.getFilesByName(nombre);
      while (anteriores.hasNext()) anteriores.next().setTrashed(true);
      var bytes = Utilities.base64Decode(pedido.pdf);
      var archivo = carpeta.createFile(Utilities.newBlob(bytes, 'application/pdf', nombre));
      return responder({ ok: true, archivoUrl: archivo.getUrl(), carpetaUrl: carpeta.getUrl() });
    }

    return responder({ ok: false, error: 'accion desconocida' });
  } catch (error) {
    return responder({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

// Al abrir el link en el navegador: confirma que el programa anda.
function doGet() {
  return responder({ ok: true, mensaje: 'DREY · evaluaciones en Drive funcionando' });
}

function carpetaPrincipal() {
  try {
    return DriveApp.getFolderById(CARPETA_PRINCIPAL);
  } catch (error) {
    return null;
  }
}

function carpetaDelAlumno(principal, alumnoId, nombreAlumno) {
  var marca = 'drey:' + alumnoId;
  var nombre = limpiar(nombreAlumno) || 'Alumno ' + String(alumnoId).slice(0, 8);
  var porNombre = null;
  var carpetas = principal.getFolders();
  while (carpetas.hasNext()) {
    var carpeta = carpetas.next();
    if (carpeta.getDescription() === marca) return carpeta;
    if (!porNombre && normalizar(carpeta.getName()) === normalizar(nombre)) porNombre = carpeta;
  }
  if (porNombre) {
    // Una carpeta hecha a mano con el nombre del alumno: desde ahora es la suya.
    if (!porNombre.getDescription()) porNombre.setDescription(marca);
    return porNombre;
  }
  var nueva = principal.createFolder(nombre);
  nueva.setDescription(marca);
  return nueva;
}

function limpiar(texto) {
  return String(texto || '')
    .replace(/[\\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizar(texto) {
  return limpiar(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// Para dar el permiso de Drive la primera vez: elegí esta función arriba
// y tocá "Ejecutar". Tiene que mostrar el nombre de la carpeta.
function probar() {
  var carpeta = carpetaPrincipal();
  Logger.log(carpeta ? 'OK: ' + carpeta.getName() : 'No encuentro la carpeta');
}
