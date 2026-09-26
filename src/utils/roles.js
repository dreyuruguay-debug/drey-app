// Tipos de cuenta (supabase/sql/020):
//
//   · Cliente: ni profe ni Admin.
//   · Profe (es_profe): entrena clientes y ve los suyos.
//   · Admin (es_admin): la cuenta del dueño de DREY. Entra al panel y ve
//     todo, pero NO es profe (no tiene clientes ni aparece en las listas
//     de profes).
//
// Una cuenta nunca es profe y Admin a la vez (lo controla la base). Todo
// lo que distinga clientes de profes usa estas funciones, así la regla
// está en un solo lugar.

export function esCliente(perfil) {
  return Boolean(perfil) && !perfil.es_profe && !perfil.es_admin
}

export function esProfe(perfil) {
  return Boolean(perfil?.es_profe)
}

export function esAdmin(perfil) {
  return Boolean(perfil?.es_admin)
}

// Profe o Admin: entra al panel en vez de a la app del alumno.
export function entraAlPanel(perfil) {
  return esProfe(perfil) || esAdmin(perfil)
}

// Filtro "solo clientes" para las consultas de "perfiles":
//   supabase.from('perfiles').select('*').match(SOLO_CLIENTES)
export const SOLO_CLIENTES = Object.freeze({ es_profe: false, es_admin: false })
