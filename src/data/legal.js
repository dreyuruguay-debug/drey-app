import { diasDeGracia } from './vencimiento.js'

// Términos y condiciones y política de privacidad de DREY (Ley 18.331 de
// protección de datos personales, Uruguay).
//
// ⚠ BORRADOR: estos textos los armamos como punto de partida. Antes de
// abrir la app a todos, que los revise un abogado. Cuando estén
// revisados:
//   1. Completá DATOS_RESPONSABLE (acá abajo) con los datos reales.
//   2. Poné TEXTOS_REVISADOS = true en data/versionLegal.js (así deja de
//      verse el aviso de "borrador" arriba de cada texto).
//   3. Si cambiaste algo importante, cambiá VERSION_TERMINOS (también en
//      data/versionLegal.js) por la fecha de hoy: todos los usuarios van
//      a tener que aceptar la versión nueva la próxima vez que entren.
export const DATOS_RESPONSABLE = {
  nombre: 'DREY (completar: nombre completo o razón social)',
  documento: 'completar: cédula o RUT',
  domicilio: 'completar: domicilio',
  email: 'completar: email de contacto',
}

const R = DATOS_RESPONSABLE

export const POLITICA_PRIVACIDAD = {
  titulo: 'Política de privacidad',
  secciones: [
    {
      titulo: '1. Quién cuida tus datos',
      parrafos: [
        `El responsable de la base de datos es ${R.nombre} (${R.documento}), con domicilio en ${R.domicilio}. Para cualquier consulta sobre tus datos escribí a ${R.email}.`,
      ],
    },
    {
      titulo: '2. Qué datos guardamos',
      parrafos: [
        'Datos de identificación y contacto: nombre, apellido, email y celular.',
        'Datos físicos y de salud: fecha de nacimiento, peso, objetivo y las lesiones o limitaciones que nos cuentes. Son datos sensibles y los tratamos con cuidado especial (ver punto 4).',
        'Datos de entrenamiento: tus rutinas, los pesos y repeticiones que registrás, cómo te sentiste y tus comentarios al profe.',
        'Datos de pago: el plan, las fechas de pago y el comprobante si lo subís. Los datos de tu tarjeta los maneja Mercado Pago: DREY nunca los ve ni los guarda.',
        'Datos técnicos: si la app falla, se registra el error (qué pantalla, qué celular) sin tu nombre, email ni datos de salud.',
      ],
    },
    {
      titulo: '3. Para qué los usamos',
      parrafos: [
        'Para darte el servicio: que tu profe arme rutinas adaptadas a vos, siga tu progreso y te arme las evaluaciones mensuales; para cobrar tu plan y avisarte cuando vence; y para que la app funcione bien.',
        'No vendemos ni alquilamos tus datos, y no los usamos para publicidad de terceros.',
      ],
    },
    {
      titulo: '4. Datos de salud: tu consentimiento',
      parrafos: [
        'La ley considera sensibles los datos de salud y pide tu consentimiento expreso para tratarlos. Te lo pedimos con una casilla aparte al registrarte.',
        'Solo los ve tu profe (y el responsable de DREY), y solo para adaptar tu entrenamiento. Podés cambiarlos o borrarlos cuando quieras desde "Mis datos".',
      ],
    },
    {
      titulo: '5. Quién más accede',
      parrafos: [
        'Tu profe o el gimnasio que elegiste al registrarte. Cada profe ve solamente a sus clientes.',
        'Proveedores que necesitamos para que la app funcione, que solo guardan o procesan los datos por cuenta nuestra: Supabase (base de datos), Cloudflare (publicación de la web), Mercado Pago (pagos), Sentry (registro de errores, sin datos personales) y Google (Google Drive: una copia en PDF de tus evaluaciones mensuales, en una carpeta privada de DREY). Algunos de estos servicios tienen sus servidores fuera de Uruguay; al aceptar esta política autorizás esa transferencia, que se hace con proveedores que aplican medidas de seguridad adecuadas.',
        'Si te unís al grupo de WhatsApp de la comunidad, lo que compartas ahí se rige por las reglas de WhatsApp.',
      ],
    },
    {
      titulo: '6. Cuánto tiempo los guardamos',
      parrafos: [
        'Mientras tu cuenta esté activa. Si pedís la baja, borramos tu cuenta y tus datos, salvo lo que la ley nos obligue a conservar (por ejemplo, registros de pagos).',
      ],
    },
    {
      titulo: '7. Tus derechos',
      parrafos: [
        'Tenés derecho a acceder a tus datos, a rectificarlos, actualizarlos, pedir que se incluyan o que se supriman, y a retirar tu consentimiento.',
        `Desde la app: "Perfil" → "Privacidad y mis datos" podés descargar todos tus datos y pedir la baja de tu cuenta. También podés escribir a ${R.email}. Te respondemos dentro de los 5 días hábiles.`,
        'Si considerás que no respetamos tus derechos, podés presentar un reclamo ante la Unidad Reguladora y de Control de Datos Personales (URCDP): www.gub.uy/unidad-reguladora-control-datos.',
      ],
    },
    {
      titulo: '8. Seguridad',
      parrafos: [
        'La conexión con la app está cifrada, tu contraseña se guarda cifrada y cada persona solo puede ver lo suyo. Parte de tus rutinas se guarda en tu celular para que puedas entrenar sin señal; si cerrás sesión se borra.',
      ],
    },
    {
      titulo: '9. Menores de edad',
      parrafos: [
        'DREY es para mayores de 18 años. Si sos menor, necesitás la autorización de tu madre, padre o tutor para usar la app.',
      ],
    },
    {
      titulo: '10. Cambios en esta política',
      parrafos: [
        'Si la cambiamos, te lo vamos a avisar en la app y te vamos a pedir que la aceptes de nuevo.',
      ],
    },
  ],
}

export const TERMINOS_Y_CONDICIONES = {
  titulo: 'Términos y condiciones',
  secciones: [
    {
      titulo: '1. El servicio',
      parrafos: [
        `DREY es una app para seguir tu entrenamiento: tu profe te arma las rutinas y vos registrás lo que hacés. La brinda ${R.nombre} (${R.documento}).`,
      ],
    },
    {
      titulo: '2. Tu cuenta',
      parrafos: [
        'La cuenta es personal: no la compartas. Los datos que cargues tienen que ser verdaderos, sobre todo tus lesiones y limitaciones, porque tu profe arma la rutina en base a eso.',
      ],
    },
    {
      titulo: '3. Planes y pagos',
      // Se arma al mostrarla: los días de gracia los elige el Admin.
      get parrafos() {
        return [
          'Los planes se pagan por mes, por adelantado. El precio del primer mes puede ser distinto al de los siguientes; los precios vigentes se ven en la app.',
          `Tu cuenta queda activa hasta la fecha de vencimiento que ves en "Suscripción". Si no pagás, tenés ${diasDeGracia()} días de gracia para seguir entrenando; después se pausa el acceso a tus rutinas hasta que pagues. Tu historial no se borra.`,
          'Los códigos de descuento tienen las condiciones que se indiquen en cada uno (plazo, cantidad de usos, si valen solo el primer mes).',
        ]
      },
    },
    {
      titulo: '4. Salud y responsabilidad',
      parrafos: [
        'Antes de empezar a entrenar te recomendamos consultar a un médico y tener tu carné de salud o apto físico al día.',
        'Si sentís dolor, mareo o algo fuera de lo normal, pará y avisale a tu profe. Hacé los ejercicios con la técnica y los pesos indicados; si no estás seguro, preguntá.',
        'La app es una herramienta de apoyo y no reemplaza la consulta médica.',
      ],
    },
    {
      titulo: '5. Uso correcto',
      parrafos: [
        'No se puede usar la app para otra cosa que tu entrenamiento, ni intentar acceder a datos de otras personas. Las rutinas y los contenidos son de tu profe y de DREY: son para tu uso personal.',
      ],
    },
    {
      titulo: '6. Baja',
      parrafos: [
        'Podés dejar de usar DREY cuando quieras y pedir la baja de tu cuenta desde "Perfil" → "Privacidad y mis datos". Lo ya pagado no se devuelve, salvo lo que diga la ley.',
      ],
    },
    {
      // Para las cuentas de profe y de gimnasio (cobro por cupos, SQL 032 y 033).
      titulo: '7. Profes y gimnasios',
      get parrafos() {
        return [
          'Si te registrás como profe o con un gimnasio, le pagás a DREY un plan por mes según cuántos alumnos podés tener habilitados a la vez (cupos). Los planes y precios vigentes se ven en la app. Tus alumnos te pagan a vos, según los planes y precios que vos definas.',
          'Las cuentas nuevas empiezan con una prueba gratis, con los días y alumnos que se indiquen en la app. Si al terminar la prueba o al vencer tu plan no pagás, no vas a poder habilitar alumnos nuevos y, pasado el plazo que indica la app, tus alumnos dejan de ver sus rutinas hasta que se regularice.',
          'Vas a ver datos personales y de salud de tus alumnos: los usás solo para entrenarlos, no los compartís con nadie y los cuidás como indica la Ley 18.331. La biblioteca de ejercicios es compartida: usala con cuidado.',
          'DREY puede pausar o dar de baja una cuenta de profe o gimnasio que no cumpla estos términos.',
        ]
      },
    },
    {
      titulo: '8. Cambios y ley aplicable',
      parrafos: [
        'Si cambiamos estos términos te vamos a avisar en la app. Se rigen por las leyes de la República Oriental del Uruguay.',
      ],
    },
  ],
}
