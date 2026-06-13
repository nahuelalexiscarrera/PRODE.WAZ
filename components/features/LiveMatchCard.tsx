import Link from "next/link";
import { Flag } from "@/components/ui/Flag";
import { cn } from "@/lib/utils/cn";

interface LiveMatchCardProps {
  homeCode: string;
  awayCode: string;
  homeTeamName: string;
  awayTeamName: string;
  /** Marcador parcial; null mientras la API todavía no lo reporta (0 vs sin dato). */
  liveHomeScore: number | null;
  liveAwayScore: number | null;
  groupId: string | null;
  className?: string;
}

/** Card de un partido EN CURSO con su marcador en vivo. El marcador lo refresca
 *  el sync (cada 5 min) en las columnas live_* de match; el Home se auto-actualiza
 *  con <LiveRefresher/>. No mostramos minuto exacto (la API del listado no lo da)
 *  para no inventar un dato impreciso — el badge "EN VIVO" comunica el estado. */
export function LiveMatchCard({
  homeCode,
  awayCode,
  homeTeamName,
  awayTeamName,
  liveHomeScore,
  liveAwayScore,
  groupId,
  className,
}: LiveMatchCardProps) {
  const prodeHref = groupId ? `/app/prode/grupos/${groupId.toLowerCase()}` : "/app/prode";
  const home = liveHomeScore ?? 0;
  const away = liveAwayScore ?? 0;

  return (
    <Link
      href={prodeHref}
      className={cn(
        "bg-card rounded-xl border border-border p-4 flex flex-col gap-4",
        "transition-opacity active:opacity-80",
        className
      )}
    >
      {/* Badge EN VIVO */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-live">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
          </span>
          En vivo
        </span>
        {groupId ? (
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Grupo {groupId}
          </span>
        ) : null}
      </div>

      {/* Equipos + marcador */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 flex-col items-center gap-1.5">
          <Flag code={homeCode} size="lg" />
          <span className="text-body-sm font-semibold text-text text-center">{homeTeamName}</span>
        </div>

        <div className="flex items-center gap-2 font-display text-numeric-lg text-text tabular leading-none">
          <span>{home}</span>
          <span className="text-text-muted">-</span>
          <span>{away}</span>
        </div>

        <div className="flex flex-1 flex-col items-center gap-1.5">
          <Flag code={awayCode} size="lg" />
          <span className="text-body-sm font-semibold text-text text-center">{awayTeamName}</span>
        </div>
      </div>
    </Link>
  );
}
