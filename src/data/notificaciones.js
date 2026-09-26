// Clave PÚBLICA de las notificaciones (Web Push). Es pública a propósito:
// el celular la usa para saber que los avisos vienen de DREY.
// Su pareja, la clave PRIVADA, NO va acá: se guarda solo en Supabase
// (Edge Functions → Secrets → VAPID_PRIVADA). Ver LEEME.
//
// Si algún día se cambian las claves, hay que cambiar esta y los dos
// secretos de Supabase a la vez (y cada usuario vuelve a activar los avisos).
export const VAPID_PUBLICA = 'BGv8nW7zDWZIUfRV9Bt__F_6mHDd0bCDE2QPjGvBnrJnN2EseUpOgtvT2lAddPEEN5_Z2zieAtw59zMxMBBbrnE'
