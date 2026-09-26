import { useEffect, useState } from 'react'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import { esAdminConocido, verificarProfe } from '../services/accesoProfe.js'
import { AdminInicio, PanelProfe } from '../pantallasDiferidas.js'

// "/profe": el Admin ve su resumen del negocio (AdminInicio) y el profe
// su lista de tareas (PanelProfe). Si en este celular ya se sabe quién
// es, se muestra al instante; si no, se espera la respuesta una vez.
export default function InicioPanel() {
  const [esAdmin, setEsAdmin] = useState(esAdminConocido)

  useEffect(() => {
    let activo = true
    verificarProfe().then(({ esAdmin: admin }) => activo && setEsAdmin(Boolean(admin)))
    return () => {
      activo = false
    }
  }, [])

  if (esAdmin === null) {
    return (
      <ProfeLayout>
        <Esqueleto />
      </ProfeLayout>
    )
  }
  return esAdmin ? <AdminInicio /> : <PanelProfe />
}
