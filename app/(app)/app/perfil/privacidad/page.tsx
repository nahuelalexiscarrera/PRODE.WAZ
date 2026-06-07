import { redirect } from "next/navigation";

// La política de privacidad vive ahora en la ruta PÚBLICA /privacidad. Esta ruta
// autenticada solo redirige, para que cualquier link viejo siga funcionando.
export default function PrivacidadRedirect() {
  redirect("/privacidad");
}
