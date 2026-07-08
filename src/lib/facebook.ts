/**
 * Facebook Graph API — โพสต์ลงเพจ
 * สิทธิ์ที่ต้องมี: pages_manage_posts, pages_read_engagement
 */
import { facebookReady } from "./env";

export interface FbPostResult {
  posted: boolean; // ยิงจริงไหม (false = mock)
  postId: string | null;
}

/**
 * โพสต์ข้อความ (+ ลิงก์รูป) ลงเพจ
 * mock mode: คืน postId ปลอมเพื่อให้ฟลว์เดินต่อได้
 */
export async function postToPage(message: string, link?: string): Promise<FbPostResult> {
  if (!facebookReady()) {
    return { posted: false, postId: `mock-fb-${Date.now()}` };
  }
  const pageId = process.env.FACEBOOK_PAGE_ID!;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!;
  const version = process.env.FACEBOOK_GRAPH_VERSION || "v21.0";
  const url = `https://graph.facebook.com/${version}/${pageId}/feed`;

  const params = new URLSearchParams({ message, access_token: token });
  if (link) params.set("link", link);

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Facebook post error ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return { posted: true, postId: data.id || null };
}
