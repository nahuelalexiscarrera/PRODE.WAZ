"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { signInAction, type ActionResult } from "@/lib/auth/actions";
import { useBrand } from "@/components/providers/BrandProvider";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Icon } from "@/components/ui/Icon";

function ConfirmBanner() {
  const searchParams = useSearchParams();
  const confirmed = searchParams.get("confirm") === "1";
  const errorConfirm = searchParams.get("error") === "confirm";
  if (!confirmed && !errorConfirm) return null;

  if (errorConfirm) {
    return (
      <div className="mb-6 rounded-md bg-surface border border-error/30 px-4 py-3 flex items-start gap-3">
        <Icon name="info" size={18} className="text-error mt-0.5" />
        <p className="text-body-sm text-text">
          El link de confirmación venció o ya se usó. Si ya confirmaste, entrá con tu contraseña; si
          no, registrate de nuevo para recibir uno nuevo.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-md bg-surface border border-info/30 px-4 py-3 flex items-start gap-3">
      <Icon name="info" size={18} className="text-info mt-0.5" />
      <p className="text-body-sm text-text">
        Cuenta creada. Revisá tu email para confirmarla y después entrá con tu contraseña.
      </p>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
      Ingresar
    </Button>
  );
}

/** Barra de marca: wordmark "PRODE.<marca>" (o logo subido) + badge con la
 *  sigla de la marca. Lee la marca activa de useBrand() (la resuelve el layout
 *  de (auth) por ?brand=<slug> / cookie / default WAZ). */
function BrandBar() {
  const brand = useBrand();
  const name = brand?.name ?? "WAZ";
  const badge = (brand?.shortName ?? name).slice(0, 3).toUpperCase();
  const logoUrl = brand?.logoUrl ?? null;

  return (
    <div className="flex items-center justify-between">
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt={`${name} logo`}
          width={120}
          height={36}
          unoptimized={logoUrl.startsWith("http")}
          className="h-9 w-auto object-contain"
        />
      ) : (
        <span className="font-display text-heading-md uppercase tracking-[0.04em] leading-none text-text">
          PRODE<span className="text-primary">.{name}</span>
        </span>
      )}
      <span className="flex items-center justify-center min-w-10 h-10 px-2 rounded-xl bg-primary-bg border border-primary/30">
        <span className="font-display text-heading-sm text-primary leading-none">{badge}</span>
      </span>
    </div>
  );
}

export default function LoginPage() {
  const brand = useBrand();
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction] = useFormState<ActionResult | null, FormData>(signInAction, null);
  const errorField = state && !state.ok ? state.field : undefined;
  const hashtag = "#WAZEXPERIENCE";

  return (
    <div className="min-h-screen flex flex-col px-6 pt-[calc(2rem+env(safe-area-inset-top))] pb-10">
      <BrandBar />

      {/* Hero editorial */}
      <header className="mt-10">
        <h1 className="font-display uppercase leading-[0.82] text-text">
          <span className="block text-[1.5rem] tracking-[0.18em] text-text-muted">Predecí</span>
          <span className="block text-[4rem] tracking-[0.01em] text-primary">Mundial</span>
          <span className="block text-[1.5rem] tracking-[0.42em] text-text-muted mt-1">2 0 2 6</span>
        </h1>
      </header>

      <div className="flex-1 min-h-[4vh]" />

      <div className="border-t border-border mb-7" />

      <Suspense fallback={null}>
        <ConfirmBanner />
      </Suspense>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          state={errorField === "email" ? "error" : "default"}
        />

        <Input
          label="Contraseña"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          required
          leftIcon="lock"
          state={errorField === "password" ? "error" : "default"}
          rightElement={
            <IconButton
              type="button"
              label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              icon="eye"
              variant="ghost"
              size="sm"
              onClick={() => setShowPassword((v) => !v)}
            />
          }
        />

        {state && !state.ok && (
          <p role="alert" className="text-body-sm text-error">
            {state.error}
          </p>
        )}

        <div className="text-right -mt-1">
          <Link href="/forgot" className="text-body-sm text-primary hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <div className="mt-2">
          <SubmitButton />
        </div>
      </form>

      <footer className="mt-8 text-center">
        <p className="text-body-sm text-text-muted">
          ¿Sos socio nuevo?{" "}
          <Link href="/register" className="text-primary font-semibold hover:underline">
            Registrate
          </Link>
        </p>
        <p className="mt-5 text-[10px] uppercase tracking-[0.28em] text-text-disabled">{hashtag}</p>
      </footer>
    </div>
  );
}
