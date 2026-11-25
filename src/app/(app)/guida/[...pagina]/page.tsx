import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FocusHeading } from "@/features/guide/FocusHeading";
import { GUIDE_TITLE_ID, GuideMarkdown } from "@/features/guide/GuideMarkdown";
import { extractTitle, stripChangelog } from "@/features/guide/markdown";
import { isGuideSlug, loadGuide } from "@/features/guide/source";

type Params = Promise<{ pagina: string[] }>;

const BACK_CLASS =
  "text-primary focus-visible:ring-ring -mx-1 inline-flex min-h-11 items-center rounded-sm px-1 underline underline-offset-2 focus-visible:ring-2 focus-visible:outline-none";

/** The page's source, only for a single segment that is exactly a real file name (R3). */
async function loadPage(params: Params) {
  const { pagina } = await params;
  const guide = await loadGuide();
  const slug = pagina.length === 1 ? (pagina[0] ?? "") : "";
  if (!isGuideSlug(slug, guide.slugs)) return null;
  const source = stripChangelog(guide.pages.get(slug) ?? "");
  const label = guide.index.find((entry) => entry.slug === slug)?.label ?? slug;
  return { slugs: guide.slugs, source, title: extractTitle(source) ?? label };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = await loadPage(params);
  return { title: page ? `${page.title} · Guida` : "Pagina non trovata" };
}

export default async function GuideDocPage({ params }: { params: Params }) {
  const page = await loadPage(params);
  if (!page) notFound();
  const isEmpty = page.source.trim() === "";
  return (
    <div className="flex max-w-prose flex-col gap-6">
      <FocusHeading targetId={GUIDE_TITLE_ID} />
      <Link href="/guida" className={BACK_CLASS}>
        ← Guida
      </Link>
      {isEmpty ? (
        <div className="flex flex-col gap-4">
          <h1
            id={GUIDE_TITLE_ID}
            tabIndex={-1}
            className="font-heading text-[28px] leading-9 focus:outline-none"
          >
            {page.title}
          </h1>
          <p className="text-muted-foreground">Questa pagina è ancora vuota.</p>
        </div>
      ) : (
        <GuideMarkdown source={page.source} slugs={page.slugs} label={page.title} />
      )}
      <Link href="/guida" className={BACK_CLASS}>
        Torna alla Guida
      </Link>
    </div>
  );
}
