/**
 * ผู้เขียนบทความด้วย Claude API (Anthropic Messages API)
 * เรียกผ่าน content.ts เมื่อ TEXT_PROVIDER=claude และ claudeReady()
 */
import type { GeneratedArticle } from "./content";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export async function generateWithClaude(topic: string, theme: string): Promise<GeneratedArticle> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  const system =
    `คุณเป็นนักเขียนคอนเทนต์ภาษาไทยมืออาชีพให้กับแบรนด์แนว ${theme} ` +
    "เขียนบทความบล็อกที่อ่านง่าย เป็นกันเอง อ้างอิงหลักวิทยาศาสตร์การออกกำลังกาย/โภชนาการอย่างถูกต้อง " +
    "ให้ข้อมูลที่นำไปใช้ได้จริง มีโครงสร้างหัวข้อชัดเจน และไม่ยัดเยียดการขาย";

  const userPrompt =
    `เขียนบทความบล็อกภาษาไทยแนว ${theme} ในหัวข้อ: "${topic}"\n\n` +
    `ข้อกำหนด:\n` +
    `- ความยาวประมาณ 500-800 คำ\n` +
    `- body เป็น Markdown (ใช้ ## สำหรับหัวข้อย่อย, - สำหรับ bullet)\n` +
    `- title ดึงดูด ไม่เกิน 70 ตัวอักษร\n` +
    `- excerpt คือคำโปรย 1-2 ประโยค สรุปว่าบทความเกี่ยวกับอะไร\n` +
    `ตอบกลับเป็น JSON ตาม schema เท่านั้น`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userPrompt }],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              title: { type: "string" },
              body: { type: "string" },
              excerpt: { type: "string" },
            },
            required: ["title", "body", "excerpt"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude API error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
  if (!textBlock?.text) throw new Error("Claude API: ไม่พบเนื้อหาในผลลัพธ์");

  const parsed = JSON.parse(textBlock.text) as GeneratedArticle;
  return {
    title: parsed.title.trim(),
    body: parsed.body.trim(),
    excerpt: parsed.excerpt.trim(),
  };
}
