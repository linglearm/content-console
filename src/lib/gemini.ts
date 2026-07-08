/**
 * ผู้เขียนบทความด้วย Google Gemini (โครงรองรับสลับ provider)
 * เปิดใช้เมื่อ TEXT_PROVIDER=gemini และมี GEMINI_API_KEY
 */
import type { GeneratedArticle } from "./content";

export async function generateWithGemini(topic: string, theme: string): Promise<GeneratedArticle> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt =
    `เขียนบทความบล็อกภาษาไทยแนว ${theme} ในหัวข้อ "${topic}" ความยาว 500-800 คำ ` +
    `อ้างอิงหลักวิทยาศาสตร์การออกกำลังกาย/โภชนาการอย่างถูกต้อง\n` +
    `ตอบกลับเป็น JSON เท่านั้น รูปแบบ: {"title": "...", "body": "markdown...", "excerpt": "คำโปรย 1-2 ประโยค"}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini API: ไม่พบเนื้อหาในผลลัพธ์");

  const parsed = JSON.parse(text) as GeneratedArticle;
  return {
    title: parsed.title.trim(),
    body: parsed.body.trim(),
    excerpt: parsed.excerpt.trim(),
  };
}
