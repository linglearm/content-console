/**
 * Facebook Graph API — โพสต์ลงเพจ
 * สิทธิ์ที่ต้องมี: pages_manage_posts, pages_read_engagement
 */
import { facebookReady } from "./env";

export interface FbPostResult {
  posted: boolean; // ยิงจริงไหม (false = mock)
  postId: string | null;
}

export interface FbPagePostResult {
  ok: boolean;
  postId?: string;
  permalinkUrl?: string;
  error?: string;
}

export interface FbCommentResult {
  ok: boolean;
  commentId?: string;
  error?: string;
}

function graphVersion(): string {
  return process.env.FACEBOOK_GRAPH_VERSION || "v21.0";
}

function facebookHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "").replace(/^web\./, "");
  return host === "facebook.com";
}

export function normalizePagePostId(rawPostId: string, pageId: string): string | null {
  const value = String(rawPostId || "").trim();
  const page = String(pageId || "").trim();
  if (!/^\d+$/.test(page) || !/^\d+_\d+$/.test(value)) return null;
  const [postPageId, storyId] = value.split("_");
  return postPageId === page && !!storyId ? value : null;
}

export function facebookStoryIdFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !facebookHost(url.hostname)) return null;
    const queryId = url.searchParams.get("story_fbid") || url.searchParams.get("fbid");
    if (queryId && /^(?:\d+|pfbid[\w-]+)$/i.test(queryId)) return queryId;
    const match = url.pathname.match(/\/(?:posts|videos)\/((?:\d+|pfbid[\w-]+))(?:\/|$)/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

export function isFacebookUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && facebookHost(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Verify the owner-supplied post instead of creating one.
 * The Graph object must belong to the configured Page. A direct URL carrying
 * a story id must agree with the id. Opaque share URLs are rejected because
 * they do not prove which post the owner intended the Bot to use.
 */
export async function verifyPagePost(postId: string, submittedUrl: string): Promise<FbPagePostResult> {
  if (!facebookReady()) return { ok: false, error: "facebook_not_configured" };
  if (!isFacebookUrl(submittedUrl)) return { ok: false, error: "invalid_facebook_url" };

  const pageId = process.env.FACEBOOK_PAGE_ID!;
  const normalizedPostId = normalizePagePostId(postId, pageId);
  if (!normalizedPostId) return { ok: false, error: "post_id_not_on_configured_page" };

  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!;
  const fields = "id,permalink_url,from{id}";
  try {
    const params = new URLSearchParams({ fields, access_token: token });
    const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${normalizedPostId}?${params}`);
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `facebook_post_lookup_${res.status}:${data?.error?.message || "failed"}` };
    }

    const graphPostId = String(data?.id || "");
    const graphPageId = String(data?.from?.id || "");
    const permalinkUrl = String(data?.permalink_url || "");
    if (graphPostId !== normalizedPostId || graphPageId !== pageId || !isFacebookUrl(permalinkUrl)) {
      return { ok: false, error: "facebook_post_page_mismatch" };
    }

    const submittedStoryId = facebookStoryIdFromUrl(submittedUrl);
    const canonicalStoryId = facebookStoryIdFromUrl(permalinkUrl);
    const graphStoryId = normalizedPostId.split("_")[1];
    if (!submittedStoryId || !canonicalStoryId) {
      return { ok: false, error: "facebook_permalink_required" };
    }
    if (submittedStoryId !== canonicalStoryId && (
      submittedStoryId !== graphStoryId || canonicalStoryId !== graphStoryId
    )) {
      return { ok: false, error: "facebook_post_url_mismatch" };
    }

    return { ok: true, postId: normalizedPostId, permalinkUrl };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "facebook_post_lookup_failed" };
  }
}

/** Create one Page comment, optionally with a public image URL. */
export async function commentOnPostDetailed(
  postId: string,
  message: string,
  attachmentUrl?: string,
): Promise<FbCommentResult> {
  const text = String(message || "").trim();
  if (!facebookReady()) return { ok: false, error: "facebook_not_configured" };
  if (!postId || !text) return { ok: false, error: "invalid_comment" };
  if (attachmentUrl && !/^https:\/\//i.test(attachmentUrl)) {
    return { ok: false, error: "invalid_attachment_url" };
  }

  const params = new URLSearchParams({
    message: text,
    access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN!,
  });
  if (attachmentUrl) params.set("attachment_url", attachmentUrl);

  try {
    const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.id) {
      return { ok: false, error: `facebook_comment_${res.status}:${data?.error?.message || "failed"}` };
    }
    return { ok: true, commentId: String(data.id) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "facebook_comment_failed" };
  }
}

/**
 * Find an exact existing Page comment. This makes a retry safe if the bridge
 * lost its response after Facebook had already accepted an earlier comment.
 */
export async function findExactPostComment(postId: string, message: string): Promise<string | null> {
  if (!facebookReady() || !postId || !message.trim()) return null;
  const pageId = process.env.FACEBOOK_PAGE_ID!;
  const params = new URLSearchParams({
    fields: "id,message,from{id}",
    limit: "100",
    access_token: process.env.FACEBOOK_PAGE_ACCESS_TOKEN!,
  });
  try {
    let next: string | null = `https://graph.facebook.com/${graphVersion()}/${postId}/comments?${params}`;
    for (let page = 0; next && page < 3; page += 1) {
      const current: string = next;
      const parsed = new URL(current);
      if (parsed.protocol !== "https:" || parsed.hostname !== "graph.facebook.com") return null;
      const res: Response = await fetch(current);
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data?.data)) return null;
      const found = data.data.find((item: any) => (
        String(item?.from?.id || "") === pageId &&
        String(item?.message || "").trim() === message.trim()
      ));
      if (found?.id) return String(found.id);
      next = typeof data?.paging?.next === "string" ? data.paging.next : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * สร้างลิงก์ไปยังโพสต์จริงบนเพจ จาก postId ที่ Graph API คืนมา
 * รูปแบบปกติคือ "{pageId}_{storyId}" → https://www.facebook.com/{pageId}/posts/{storyId}
 * mock หรือไม่มี id → คืน null (ไม่มีลิงก์ให้กด)
 */
export function fbPostUrl(postId: string | null): string | null {
  if (!postId || postId.startsWith("mock-")) return null;
  const parts = postId.split("_");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
  }
  return `https://www.facebook.com/${postId}`;
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

/**
 * คอมเมนต์ใต้โพสต์ของเพจ — ใช้ลงแหล่งอ้างอิง (references) แยกจากตัวโพสต์
 * postId = "{pageId}_{storyId}" ที่ได้จาก postToPage
 * คืน true ถ้าคอมเมนต์สำเร็จ, false ถ้า mock/ข้อความว่าง/ยิงไม่ผ่าน (ไม่ throw — คอมเมนต์พลาดไม่ควรทำให้ publish ล้ม)
 */
export async function commentOnPost(postId: string | null, message: string): Promise<boolean> {
  const text = (message || "").trim();
  if (!facebookReady() || !postId || postId.startsWith("mock-") || !text) return false;
  return (await commentOnPostDetailed(postId, text)).ok;
}
