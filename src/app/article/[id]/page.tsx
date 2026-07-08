import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticle } from "@/lib/store";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

/** markdown → React (รองรับ #, ##, - และย่อหน้า) */
function renderBody(body: string) {
  const lines = body.split("\n");
  const nodes: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: number) => {
    if (list.length) {
      nodes.push(
        <ul key={`ul-${key}`}>
          {list.map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };

  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("## ")) {
      flushList(i);
      nodes.push(<h2 key={i}>{t.slice(3)}</h2>);
    } else if (t.startsWith("# ")) {
      flushList(i);
      nodes.push(<h1 key={i}>{t.slice(2)}</h1>);
    } else if (t.startsWith("- ")) {
      list.push(t.slice(2));
    } else if (t === "") {
      flushList(i);
    } else {
      flushList(i);
      nodes.push(<p key={i}>{t}</p>);
    }
  });
  flushList(lines.length);
  return nodes;
}

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = await getArticle(id);
  if (!article || article.status !== "published") notFound();

  return (
    <article className="mx-auto max-w-3xl">
      <Link href="/" className="text-sm text-brand-600 hover:underline">
        ← กลับหน้าบล็อก
      </Link>
      <h1 className="text-3xl font-bold mt-4 mb-2">{article.title}</h1>
      <div className="text-sm text-gray-400 mb-6">{formatDate(article.published_at)}</div>
      {article.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.image_url} alt={article.title} className="w-full rounded-lg mb-6" />
      )}
      <div className="prose max-w-none">{renderBody(article.body)}</div>
      {article.refs && (
        <section className="mt-10 border-t pt-6">
          <h2 className="text-sm font-semibold text-gray-500 mb-2">แหล่งอ้างอิง</h2>
          <ul className="space-y-1 text-sm">
            {article.refs
              .split("\n")
              .map((r) => r.trim())
              .filter(Boolean)
              .map((r, i) => {
                const url = r.match(/https?:\/\/\S+/)?.[0];
                return (
                  <li key={i} className="break-words text-gray-600">
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
                        {r}
                      </a>
                    ) : (
                      r
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      )}
    </article>
  );
}
