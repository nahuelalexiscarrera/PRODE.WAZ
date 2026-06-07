import { redirect } from "next/navigation";

// Los términos viven ahora en la ruta PÚBLICA /terminos (accesible sin sesión,
// se linkea desde el registro). Esta ruta autenticada solo redirige, para que
// cualquier link viejo a /app/perfil/terminos siga funcionando.
export default function TerminosRedirect() {
  redirect("/terminos");
}
