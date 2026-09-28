import { configuracion } from './configuracion.js'

// Link de invitación al grupo de WhatsApp de la comunidad DREY. Lo carga
// el Admin en Ajustes (se copia desde WhatsApp: grupo → "Invitar al grupo
// mediante enlace"). Mientras esté vacío, el botón aparece como "Link
// disponible próximamente".
export function linkGrupoWhatsapp() {
  return configuracion().whatsappGrupoUrl || ''
}
