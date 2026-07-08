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
 * โพสต์ลงเพจ — message = เนื้อหาโพสต์เต็ม
 * ถ้ามี imageUrl → โพสต์เป็นรูป + แคปชั่นเต็ม (photo post), ล้มเหลวก็ตกไปโพสต์ข้อความแทน
 * mock mode: คืน postId ปลอมเพื่อให้ฟลว์เดินต่อได้
 */
export async function postToPage(
  message: string,
  opts?: { imageUrl?: string; link?: string }
): Promise<FbPostResult> {
  if (!facebookReady()) {
    return { posted: false, postId: `mock-fb-${Date.now()}` };
  }
  const pageId = process.env.FACEBOOK_PAGE_ID!;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!;
  const version = process.env.FACEBOOK_GRAPH_VERSION || "v21.0";
  const headers = { "content-type": "application/x-www-form-urlencoded" };

  // 1) มีรูป → โพสต์รูป + แคปชั่นเต็ม
  if (opts?.imageUrl) {
    try {
      const photoParams = new URLSearchParams({
        url: opts.imageUrl,
        message,
        access_token: token,
      });
      const res = await fetch(`https://graph.facebook.com/${version}/${pageId}/photos`, {
        method: "POST",
        headers,
        body: photoParams.toString(),
      });
      if (res.ok) {
        const data = await res.json();
        return { posted: true, postId: data.post_id || data.id || null };
      }
      // ไม่ผ่าน (เช่นรูปโหลดไม่ทัน) → ตกไปโพสต์ข้อความด้านล่าง
    } catch {
      // ตกไปโพสต์ข้อความด้านล่าง
    }
  }

  // 2) โพสต์ข้อความล้วน (+ link ถ้ามี)
  const feedParams = new URLSearchParams({ message, access_token: token });
  if (opts?.link) feedParams.set("link", opts.link);
  const res = await fetch(`https://graph.facebook.com/${version}/${pageId}/feed`, {
    method: "POST",
    headers,
    body: feedParams.toString(),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Facebook post error ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return { posted: true, postId: data.id || null };
}
