import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "SiamAthlete Blog";

export const metadata: Metadata = {
  title: SITE_NAME,
  description: "บทความฟิตเนส เพาะกาย และวิทยาศาสตร์การออกกำลังกาย — เผยแพร่อัตโนมัติผ่านระบบ content console",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <header className="border-b bg-white">
          <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
            <Link href="/" className="font-bold text-lg text-brand-700">
              {SITE_NAME}
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="hover:text-brand-600">
                บล็อก
              </Link>
              <Link href="/contact" className="hover:text-brand-600">
                ติดต่อ
              </Link>
              <Link
                href="/admin"
                className="rounded bg-brand-500 px-3 py-1.5 text-white hover:bg-brand-600"
              >
                หลังบ้าน
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <footer className="border-t bg-white">
          <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-gray-500">
            © {new Date().getFullYear()} {SITE_NAME}
          </div>
        </footer>
      </body>
    </html>
  );
}
