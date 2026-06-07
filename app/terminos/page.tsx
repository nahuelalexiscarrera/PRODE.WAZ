import { ScreenHeader } from "@/components/features/ScreenHeader";
import { getCurrentBrand } from "@/lib/brands/queries";
import { themeToCssVars } from "@/lib/brands/theme";

export const metadata = { title: "Términos y condiciones" };

// Ruta PÚBLICA (fuera de /app): accesible sin sesión, ya que se linkea desde el
// registro. getCurrentBrand devuelve la marca si hay sesión, o null → "WAZ".
export default async function TerminosPublicPage() {
  const brand = await getCurrentBrand();
  const brandName = brand?.name ?? "WAZ";

  return (
    <div
      className="mobile-container min-h-screen flex flex-col pb-[calc(2rem+env(safe-area-inset-bottom))]"
      style={themeToCssVars(brand?.theme.tokens)}
    >
      <ScreenHeader title="Términos y condiciones" backHref="/login" />

      <div className="flex flex-col gap-6 px-4 pt-4 text-body-sm text-text leading-relaxed">
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-text">1. Descripción del servicio</h2>
          <p className="text-text-muted">
            PRODE.WAZ es una competencia de predicciones deportivas para socios de {brandName}, sin
            costo adicional para el participante. El servicio permite predecir resultados de
            partidos del Mundial 2026 y competir por premios simbólicos definidos por {brandName} y
            sus marcas aliadas.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-text">2. Sin dinero ni apuestas</h2>
          <p className="text-text-muted">
            PRODE.WAZ no involucra dinero real, apuestas, ni ninguna forma de juego de azar
            regulado. Los premios son simbólicos y de carácter recreativo, definidos exclusivamente
            por {brandName} y sus aliados comerciales.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-text">3. Elegibilidad</h2>
          <p className="text-text-muted">
            La participación es para socios activos de {brandName}. {brandName} se reserva el
            derecho de revocar el acceso ante conductas contrarias a estos términos.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-text">4. Conducta en el muro social</h2>
          <p className="text-text-muted">
            El contenido publicado debe ser respetuoso con los demás socios. Queda prohibido
            publicar contenido ofensivo, discriminatorio o contrario a las normas de {brandName}. El
            equipo de {brandName} puede eliminar contenido inapropiado y suspender cuentas
            infractoras.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-text">5. Modificaciones</h2>
          <p className="text-text-muted">
            {brandName} se reserva el derecho de modificar o discontinuar el servicio en cualquier
            momento, así como ajustar las reglas de puntuación con aviso previo a los participantes.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-text">6. Contacto</h2>
          <p className="text-text-muted">
            Ante cualquier consulta podés comunicarte directamente en recepción de {brandName} o a
            través de los canales de comunicación habituales del club.
          </p>
        </section>

        <p className="text-[11px] text-text-muted mt-2">Vigente desde junio de 2026.</p>
      </div>
    </div>
  );
}
