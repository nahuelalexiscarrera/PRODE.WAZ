/**
 * PRODE.WAZ — Root Layout
 * Agente 7 · Next.js Architect
 *
 * Loads Anton + Inter via next/font (no Google Fonts runtime requests).
 * Wraps app in providers and global CSS.
 */

import type { Metadata, Viewport } from "next";
import { MotionConfig } from "framer-motion";
import { Anton, Hanken_Grotesk } from "next/font/google";
import "./styles/globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { ErrorReporter } from "@/components/features/ErrorReporter";
import { ServiceWorkerUpdater } from "@/components/features/ServiceWorkerUpdater";

const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-anton",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-hanken",
  display: "swap",
});

// PRODE.WAZ es la PLATAFORMA. El metadata a nivel root usa el nombre de la
// plataforma; cada (app) route puede sobrescribir generateMetadata para mostrar
// la marca-tenant del socio (logo/nombre) cuando haya sesión.
export const metadata: Metadata = {
  title: {
    default: "PRODE.WAZ — Mundial 2026",
    template: "%s · PRODE.WAZ",
  },
  description:
    "Competí con tu comunidad y demostrá que sabés de fútbol. El prode del Mundial 2026.",
  applicationName: "PRODE.WAZ",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "PRODE.WAZ",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    title: "PRODE.WAZ — Mundial 2026",
    description: "El prode del Mundial 2026 para tu comunidad.",
    siteName: "PRODE.WAZ",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0D",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR" className={`${anton.variable} ${hanken.variable}`}>
      <body>
        {/* Icon sprite (inlined for offline / instant access) */}
        <svg aria-hidden="true" style={{ position: "absolute", width: 0, height: 0 }}>
          <use href="/design/icons.svg" />
        </svg>
        {/* reducedMotion="user": Framer Motion respeta prefers-reduced-motion
            (transform/scale/rotate se reducen a fade). a11y WCAG 2.3.3. */}
        <ErrorReporter />
        <ServiceWorkerUpdater />
        <MotionConfig reducedMotion="user">
          <ToastProvider>{children}</ToastProvider>
        </MotionConfig>
      </body>
    </html>
  );
}
