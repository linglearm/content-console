/**
 * สร้างการ์ด LINE Flex Message สำหรับดราฟต์รออนุมัติ (มีปุ่มในตัว)
 *  - รูป hero + หัวเรื่อง + คำโปรย
 *  - ปุ่ม: ✅ อนุมัติ (เขียว, datetimepicker), ✏️ แก้ไข (เทา-ฟ้า, ลิงก์ /admin), 🚫 ไม่อนุมัติ (แดง, postback)
 * ปุ่มใช้ postback/datetimepicker ให้ webhook รับแล้วทำงานจริง
 */
import type { Article } from "./types";

const GREEN = "#16a34a";
const SLATE = "#475569"; // เทา-ฟ้า
const RED = "#dc2626";
const ORANGE = "#f97316";

export function buildDraftFlex(
  article: Article,
  siteUrl: string
): { altText: string; contents: Record<string, unknown> } {
  const body: object[] = [
    { type: "text", text: "📝 ดราฟต์รออนุมัติ", size: "xs", color: ORANGE, weight: "bold" },
    { type: "text", text: article.title, weight: "bold", size: "lg", wrap: true, color: "#111827", margin: "sm" },
  ];
  if (article.excerpt) {
    body.push({ type: "text", text: article.excerpt, size: "sm", color: "#6b7280", wrap: true, margin: "sm" });
  }
  body.push({ type: "text", text: `หัวข้อ: ${article.topic}`, size: "xxs", color: "#9ca3af", wrap: true, margin: "md" });

  const bubble: Record<string, unknown> = {
    type: "bubble",
    body: { type: "box", layout: "vertical", spacing: "none", contents: body },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: GREEN,
          height: "sm",
          action: {
            type: "datetimepicker",
            label: "✅ อนุมัติ + ตั้งเวลา",
            data: `action=approve&id=${article.id}`,
            mode: "datetime",
          },
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            {
              type: "button",
              style: "primary",
              color: SLATE,
              height: "sm",
              flex: 1,
              action: { type: "uri", label: "✏️ แก้ไข", uri: `${siteUrl}/admin?edit=${article.id}` },
            },
            {
              type: "button",
              style: "primary",
              color: RED,
              height: "sm",
              flex: 1,
              action: {
                type: "postback",
                label: "🚫 ไม่อนุมัติ",
                data: `action=reject&id=${article.id}`,
                displayText: "🚫 ไม่อนุมัติบทความนี้",
              },
            },
          ],
        },
      ],
    },
  };

  if (article.image_url) {
    bubble.hero = {
      type: "image",
      url: article.image_url,
      size: "full",
      aspectRatio: "16:9",
      aspectMode: "cover",
    };
  }

  return { altText: `📝 ดราฟต์รออนุมัติ: ${article.title}`, contents: bubble };
}
