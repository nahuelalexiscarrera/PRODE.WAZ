"use client";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { createBrandAction, updateBrandAction } from "@/lib/super-admin/actions";
import type { BrandDetail, ThemeOption } from "@/lib/super-admin/queries";
import { cn } from "@/lib/utils/cn";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ThemePicker } from "./ThemePicker";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // quita acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/** Base URL de producción para construir el link de invitación copiable.
 *  NEXT_PUBLIC_ está expuesto al client; si falta queda relativo. */
const APP_BASE = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";

interface BrandFormProps {
  mode: "create" | "edit";
  themes: ThemeOption[];
  initial?: BrandDetail;
  /** Mostrar el switch de estado activo (create). En edit el estado se maneja
   *  con el toggle rápido del detalle, así que va en false. */
  showStatus?: boolean;
}

export function BrandForm({ mode, themes, initial, showStatus = true }: BrandFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(mode === "edit");
  const [shortName, setShortName] = useState(initial?.shortName ?? "");
  const [subBrand, setSubBrand] = useState(initial?.subBrand ?? "");
  const [hashtagSuffix, setHashtagSuffix] = useState(initial?.hashtagSuffix ?? "");
  const [themeSlug, setThemeSlug] = useState(initial?.themeSlug ?? themes[0]?.slug ?? "o2");
  const [active, setActive] = useState((initial?.status ?? "active") === "active");
  const [adminEmails, setAdminEmails] = useState("");

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(initial?.logoUrl ?? null);
  const [errorField, setErrorField] = useState<string | undefined>();

  function onName(v: string) {
    setName(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast({ variant: "error", message: "El logo supera los 2 MB." });
      return;
    }
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  }

  function submit() {
    setErrorField(undefined);
    if (name.trim().length < 2) {
      setErrorField("name");
      toast({ variant: "error", message: "Poné un nombre de al menos 2 caracteres." });
      return;
    }
    if (!/^[a-z0-9-]{2,32}$/.test(slug)) {
      setErrorField("slug");
      toast({ variant: "error", message: "Slug inválido (a-z, 0-9, guión)." });
      return;
    }
    if (!/^[A-Z0-9]{1,16}$/.test(hashtagSuffix.toUpperCase())) {
      setErrorField("hashtagSuffix");
      toast({ variant: "error", message: "Hashtag: solo letras/números, hasta 16." });
      return;
    }
    // Logo obligatorio al crear una marca nueva.
    if (mode === "create" && !logoFile && !logoPreview) {
      setErrorField("file");
      toast({ variant: "error", message: "El logo es obligatorio para crear una marca." });
      return;
    }
    // Theme obligatorio.
    if (!themeSlug) {
      setErrorField("themeSlug");
      toast({ variant: "error", message: "Seleccioná un tema visual." });
      return;
    }

    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("slug", slug);
    fd.set("shortName", shortName.trim());
    fd.set("subBrand", subBrand.trim());
    fd.set("hashtagSuffix", hashtagSuffix.toUpperCase());
    fd.set("themeSlug", themeSlug);
    fd.set("status", showStatus ? (active ? "active" : "inactive") : (initial?.status ?? "active"));
    if (logoFile) fd.set("file", logoFile);
    if (mode === "create") fd.set("adminEmails", adminEmails);
    if (mode === "edit" && initial) fd.set("brandId", initial.id);

    startTransition(async () => {
      const res = mode === "create" ? await createBrandAction(fd) : await updateBrandAction(fd);
      if (res.ok) {
        if (mode === "create") {
          toast({ variant: "success", message: "Marca creada." });
          router.push(`/app/super-admin/marcas/${res.data?.brandId}`);
        } else {
          toast({ variant: "success", message: "Cambios guardados." });
          router.refresh();
        }
      } else {
        setErrorField(res.field);
        toast({ variant: "error", message: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-5 px-4">
      {/* Identidad */}
      <div className="flex flex-col gap-4">
        <Input
          label="Nombre de la marca"
          value={name}
          onChange={(e) => onName(e.target.value)}
          state={errorField === "name" ? "error" : "default"}
          maxLength={40}
        />
        <Input
          label="Slug (URL de invitación)"
          value={slug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(slugify(e.target.value));
          }}
          helper={`Link de registro: ${APP_BASE}/${slug || "slug"}/register`}
          state={errorField === "slug" ? "error" : "default"}
          leftIcon="building"
        />
        <Input
          label="Hashtag (sin #)"
          value={hashtagSuffix}
          onChange={(e) => setHashtagSuffix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
          helper={`Se renderiza como #PRODEMUNDIAL${hashtagSuffix || "XX"}`}
          state={errorField === "hashtagSuffix" ? "error" : "default"}
          maxLength={16}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Nombre corto"
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            helper="Header"
            maxLength={24}
          />
          <Input
            label="Bajada"
            value={subBrand}
            onChange={(e) => setSubBrand(e.target.value)}
            helper="Ej: Wellness Club"
            maxLength={40}
          />
        </div>
      </div>

      {/* Logo */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={cn(
            "text-[11px] font-bold uppercase tracking-[0.12em]",
            errorField === "file" ? "text-error" : "text-text-muted"
          )}>
            Logo{mode === "create" ? " *" : ""}
          </span>
          {mode === "create" && !logoPreview && (
            <span className="text-[11px] text-text-disabled">Obligatorio</span>
          )}
        </div>
        <div className={cn(
          "flex items-center gap-3 rounded-xl border p-3 transition-colors",
          errorField === "file"
            ? "border-error bg-error-bg"
            : "border-border bg-surface"
        )}>
          <span className="w-14 h-14 rounded-lg border border-border bg-card flex items-center justify-center overflow-hidden flex-shrink-0">
            {logoPreview ? (
              <Image
                src={logoPreview}
                alt="Logo"
                width={56}
                height={56}
                unoptimized
                className="w-full h-full object-contain"
              />
            ) : (
              <Icon name="image" size={24} className="text-text-disabled" />
            )}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onPickLogo}
            className="hidden"
          />
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <Button
              type="button"
              variant="secondary"
              size="md"
              leftIcon="upload"
              onClick={() => fileRef.current?.click()}
            >
              {logoPreview ? "Cambiar logo" : "Subir logo"}
            </Button>
            <span className="text-[11px] text-text-disabled">PNG, JPG o WEBP · hasta 2 MB.</span>
          </div>
        </div>
        {errorField === "file" && (
          <p className="text-[11px] text-error">El logo es obligatorio para crear una marca.</p>
        )}
      </div>

      {/* Tema */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
          Tema visual
        </span>
        <ThemePicker themes={themes} value={themeSlug} onChange={setThemeSlug} />
      </div>

      {/* Admins (solo create) */}
      {mode === "create" && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
            Administradores (opcional)
          </span>
          <textarea
            value={adminEmails}
            onChange={(e) => setAdminEmails(e.target.value)}
            placeholder="emails separados por coma o salto de línea"
            rows={3}
            className="w-full rounded-md bg-surface border border-border px-3 py-2.5 text-body-sm text-text outline-none focus:border-primary resize-none"
          />
          <span className="text-[11px] text-text-disabled">
            Si el email ya tiene cuenta, se promueve al instante. Si no, recibe acceso al
            registrarse.
          </span>
        </div>
      )}

      {/* Estado (solo create) */}
      {showStatus && (
        <div className="flex items-center justify-between bg-card rounded-xl border border-border px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-body-sm text-text font-medium">Marca activa</span>
            <span className="text-[11px] text-text-muted">
              Si está inactiva, no acepta registros nuevos.
            </span>
          </div>
          <Switch checked={active} onChange={setActive} ariaLabel="Marca activa" />
        </div>
      )}

      <div className={cn("pt-2 pb-2")}>
        <Button onClick={submit} loading={pending} fullWidth size="lg">
          {mode === "create" ? "Crear marca" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}
