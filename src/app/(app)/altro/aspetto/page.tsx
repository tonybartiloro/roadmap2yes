import type { Metadata } from "next";
import { ThemeGallery } from "@/components/ThemeGallery";
import { saveThemeAction } from "@/features/appearance/actions";

export const metadata: Metadata = { title: "Aspetto" };

/**
 * Altro > Aspetto (AC49). The theme belongs to the wedding: "Usa questo tema" saves it with the
 * server action and the gallery then applies it and writes the cookie. Light/dark is per device.
 */
export default function AspettoPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-[28px] leading-9">Aspetto</h1>
      <ThemeGallery onSave={saveThemeAction} />
    </div>
  );
}
