import Link from "next/link";
import { listPublished } from "@/lib/store";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

export default async function HomePage() {
  const articles = await listPublished();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">บทความล่าสุด</h1>

      {articles.length === 0 ? (
        <p className="text-gray-500">ยังไม่มีบทความที่เผยแพร่</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((a) => (
            <Link
              key={a.id}
              href={`/article/${a.id}`}
              className="block rounded-lg border bg-white overflow-hidden hover:shadow-md transition-shadow"
            >
              {a.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.image_url} alt={a.title} className="w-full aspect-video object-cover" />
              )}
              <div className="p-4">
                <div className="text-xs text-gray-400 mb-1">{formatDate(a.published_at)}</div>
                <h2 className="font-semibold leading-snug mb-2 line-clamp-2">{a.title}</h2>
                <p className="text-sm text-gray-600 line-clamp-3">{a.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
