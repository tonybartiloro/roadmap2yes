import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { APP_NAME } from "@/components/app-name";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { getTheme } from "@/themes/approved";
import { fontVariableClassName } from "@/themes/fonts";
import { MODE_SCRIPT } from "@/themes/mode";
import { getActiveThemeId } from "@/themes/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Organizziamo il matrimonio, un passo alla volta.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Root layout (design §5.4): theme from the DB, else the `r2y-theme` cookie, else "giardino",
 * written to `<html data-theme>` on the server so there is no flash; the inline script sets
 * `data-mode` (per device) and `theme-color` before the first paint.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const themeId = await getActiveThemeId();
  const theme = getTheme(themeId);

  return (
    <html
      lang="it"
      data-theme={themeId}
      className={fontVariableClassName}
      // `data-mode` is set by MODE_SCRIPT before hydration, so it differs from the server HTML.
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content={theme.light.background} />
        <script dangerouslySetInnerHTML={{ __html: MODE_SCRIPT }} />
      </head>
      <body className="bg-background text-foreground min-h-dvh antialiased">
        <ThemeProvider initialThemeId={themeId}>
          <OfflineBanner />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
