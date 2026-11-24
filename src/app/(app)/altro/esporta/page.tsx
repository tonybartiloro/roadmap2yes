import type { Metadata } from "next";
import { exportFileNames } from "@/domain/export";
import { loadLastExport } from "@/features/export/data";
import { ExportPanel } from "@/features/export/ExportPanel";
import { pageContext } from "@/features/export/server";

export const metadata: Metadata = { title: "Esportazione" };

/**
 * Altro > Esportazione (AC42). Three downloads (JSON with everything, CSV of the tasks, CSV of the
 * budget) with the date in the name, and when the last export was.
 */
export default async function EsportaPage() {
  const { db, userId, today } = await pageContext();
  const last = await loadLastExport(db, userId, today);
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="font-heading text-[28px] leading-9">Esportazione</h1>
      <p className="text-muted-foreground">
        Scarica una copia dei dati del vostro matrimonio, da tenere con te o da aprire in un foglio
        di calcolo.
      </p>
      <p data-testid="last-export" className="font-semibold">
        {last.label[0]?.toUpperCase()}
        {last.label.slice(1)}
      </p>
      <ExportPanel fileNames={exportFileNames(today)} />
    </div>
  );
}
