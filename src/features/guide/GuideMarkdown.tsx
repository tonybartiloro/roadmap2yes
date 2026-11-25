import "server-only";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ComponentProps } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { resolveGuideHref } from "./markdown";

/** Heading id the client focuses after an internal navigation. */
export const GUIDE_TITLE_ID = "guida-titolo";

const LINK_CLASS =
  "text-primary underline underline-offset-2 focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none";
const SCROLL_CLASS =
  "focus-visible:ring-ring max-w-full overflow-x-auto focus-visible:ring-2 focus-visible:outline-none";

type Props<T extends keyof React.JSX.IntrinsicElements> = ComponentProps<T> & { node?: unknown };

/** react-markdown passes the hast `node`; it must not reach the DOM element. */
function plain<T extends { node?: unknown }>(props: T): Omit<T, "node" | "ref"> {
  const copy: Partial<T> = { ...props };
  delete copy.node;
  delete (copy as { ref?: unknown }).ref;
  return copy as Omit<T, "node" | "ref">;
}

function buildComponents(slugs: readonly string[], label: string): Components {
  return {
    h1: (props: Props<"h1">) => (
      <h1
        {...plain(props)}
        id={GUIDE_TITLE_ID}
        tabIndex={-1}
        className="font-heading scroll-mt-4 text-[28px] leading-9 focus:outline-none"
      />
    ),
    h2: (props: Props<"h2">) => (
      <h2 {...plain(props)} className="font-heading mt-4 text-2xl leading-8" />
    ),
    h3: (props: Props<"h3">) => (
      <h3 {...plain(props)} className="font-heading mt-2 text-xl leading-7" />
    ),
    h4: (props: Props<"h4">) => <h4 {...plain(props)} className="mt-2 text-base font-semibold" />,
    p: (props: Props<"p">) => <p {...plain(props)} className="leading-7" />,
    ul: (props: Props<"ul">) => (
      <ul {...plain(props)} className="list-disc space-y-1 pl-6 leading-7" />
    ),
    ol: (props: Props<"ol">) => (
      <ol {...plain(props)} className="list-decimal space-y-1 pl-6 leading-7" />
    ),
    strong: (props: Props<"strong">) => <strong {...plain(props)} className="font-semibold" />,
    blockquote: (props: Props<"blockquote">) => (
      <blockquote
        {...plain(props)}
        className="border-border text-muted-foreground border-l-4 pl-4"
      />
    ),
    hr: () => <hr className="border-border" />,
    a: ({ href, children }: Props<"a">) => {
      const target = resolveGuideHref(href, slugs);
      if (target.kind === "internal") {
        return (
          <Link href={target.href} className={LINK_CLASS}>
            {children}
          </Link>
        );
      }
      if (target.kind === "external") {
        return (
          <a href={target.href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            {children}
            <ExternalLink aria-hidden className="ml-1 inline size-3.5 align-[-0.1em]" />
            <span className="sr-only"> (si apre in una nuova scheda)</span>
          </a>
        );
      }
      return <span data-guide-unresolved="">{children}</span>;
    },
    table: (props: Props<"table">) => (
      <div role="region" aria-label={`Tabella: ${label}`} tabIndex={0} className={SCROLL_CLASS}>
        <table {...plain(props)} className="w-full border-collapse text-left text-sm" />
      </div>
    ),
    th: (props: Props<"th">) => (
      <th
        {...plain(props)}
        scope="col"
        className="border-border bg-muted border px-3 py-2 font-semibold"
      />
    ),
    td: (props: Props<"td">) => (
      <td {...plain(props)} className="border-border border px-3 py-2 align-top" />
    ),
    code: (props: Props<"code">) => (
      <code
        {...plain(props)}
        className="bg-muted rounded px-1 py-0.5 font-mono text-[0.9em] [overflow-wrap:anywhere]"
      />
    ),
    pre: (props: Props<"pre">) => (
      <pre
        {...plain(props)}
        tabIndex={0}
        className={`${SCROLL_CLASS} bg-muted rounded-md p-3 text-sm [&_code]:bg-transparent [&_code]:p-0`}
      />
    ),
  };
}

/**
 * Renders one guide page. Server-only: no Markdown code reaches the browser.
 * Raw HTML in the source is dropped (`skipHtml`); links follow `resolveGuideHref`.
 */
export function GuideMarkdown({
  source,
  slugs,
  label = "pagina",
}: {
  source: string;
  slugs: readonly string[];
  /** Accessible name suffix for scrollable tables (the page title). */
  label?: string;
}) {
  return (
    <div className="flex max-w-prose flex-col gap-4">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={buildComponents(slugs, label)}>
        {source}
      </Markdown>
    </div>
  );
}
