import type { MetadataRoute } from "next";
import { APP_NAME } from "@/components/app-name";
import { getTheme, DEFAULT_THEME_ID } from "@/themes/approved";

/** Static (no DB): the manifest cannot follow the wedding theme, so it uses the default one. */
export default function manifest(): MetadataRoute.Manifest {
  const { light } = getTheme(DEFAULT_THEME_ID);
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Organizziamo il matrimonio, un passo alla volta.",
    lang: "it",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: light.background,
    theme_color: light.background,
  };
}
