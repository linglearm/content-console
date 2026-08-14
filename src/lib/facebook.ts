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
  return ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"]
    .includes(hostname.toLowerCase());
}

function graphHost(hostname: string): boolean {
  return hostname.toLowerCase() === "graph.facebook.com";
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
    const match = url.pathname.match(/\/(?:posts|videos|reel|reels)\/((?:\d+|pfbid[\w-]+))(?:\/|$)/i);
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

function comparableFacebookUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !facebookHost(url.hostname)) return null;
    const storyId = facebookStoryIdFromUrl(url.toString());
    if (storyId) return `story:${storyId}`;
    const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    return `path:${path}`;
  } catch {
    return null;
  }
}

function sameFacebookPost(
  submittedUrls: string[],
  permalinkUrl: string,
  graphStoryId: string,
): boolean {
  const canonical = comparableFacebookUrl(permalinkUrl);
  const canonicalStoryId = facebookStoryIdFromUrl(permalinkUrl);
  return submittedUrls.some((rawUrl) => {
    const submitted = comparableFacebookUrl(rawUrl);
    const submittedStoryId = facebookStoryIdFromUrl(rawUrl);
    if (submitted && canonical && submitted === canonical) return true;
    if (!submittedStoryId) return false;
    return submittedStoryId === canonicalStoryId || submittedStoryId === graphStoryId;
  });
}

function decodeFacebookHtmlUrl(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x0*2f;/gi, "/")
    .replace(/\\u0025/gi, "%")
    .replace(/\\\//g, "/");
}

function canonicalFacebookUrlsFromHtml(html: string): string[] {
  const candidates: string[] = [];
  for (const tag of html.match(/<(?:link|meta)\b[^>]*>/gi) || []) {
    const attrs = new Map<string, string>();
    for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(["'])([\s\S]*?)\2/gi)) {
      attrs.set(match[1].toLowerCase(), decodeFacebookHtmlUrl(match[3]));
    }
    const relation = (attrs.get("rel") || attrs.get("property") || attrs.get("name") || "").toLowerCase();
    const value = attrs.get("href") || attrs.get("content") || "";
    if ((relation === "canonical" || relation === "og:url") && isFacebookUrl(value)) {
      candidates.push(value);
    }
  }
  return candidates;
}

/** Resolve a mobile /share/... link without ever following it off Facebook. */
async function resolveFacebookWebUrl(rawUrl: string): Promise<string | null> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return null;
  }
  if (current.protocol !== "https:" || !facebookHost(current.hostname)) return null;

  for (let hop = 0; hop < 4; hop += 1) {
    if (facebookStoryIdFromUrl(current.toString())) return current.toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "Mozilla/5.0 (compatible; JongrakHealthBot/1.0)",
        },
        signal: controller.signal,
      });
      const responseUrl = isFacebookUrl(res.url) ? res.url : current.toString();
      if (facebookStoryIdFromUrl(responseUrl)) return responseUrl;

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        const next = new URL(location, current);
        if (next.protocol !== "https:" || !facebookHost(next.hostname)) return null;
        current = next;
        continue;
      }

      const contentType = res.headers.get("content-type") || "";
      const contentLength = Number(res.headers.get("content-length") || "0");
      if (!contentType.toLowerCase().includes("text/html") || contentLength > 1_000_000) {
        return responseUrl;
      }
      const html = await res.text();
      for (const candidate of canonicalFacebookUrlsFromHtml(html.slice(0, 1_000_000))) {
        if (facebookStoryIdFromUrl(candidate)) return candidate;
      }
      return responseUrl;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

type GraphPagePost = { id: string; permalinkUrl: string; pageId: string };

function validatedGraphPagePost(data: any, configuredPageId: string): GraphPagePost | null {
  const id = normalizePagePostId(String(data?.id || ""), configuredPageId);
  const permalinkUrl = String(data?.permalink_url || "");
  const pageId = String(data?.from?.id || "");
  if (!id || pageId !== configuredPageId || !isFacebookUrl(permalinkUrl)) return null;
  return { id, permalinkUrl, pageId };
}

async function graphJson(url: URL, token: string): Promise<{ ok: boolean; status: number; data: any }> {
  url.searchParams.delete("access_token");
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

async function lookupPagePostById(
  postId: string,
  pageId: string,
  token: string,
): Promise<{ post?: GraphPagePost; error?: string }> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${postId}`);
  url.searchParams.set("fields", "id,permalink_url,from{id}");
  const result = await graphJson(url, token);
  if (!result.ok) {
    return { error: `facebook_post_lookup_${result.status}:${result.data?.error?.message || "failed"}` };
  }
  const post = validatedGraphPagePost(result.data, pageId);
  return post ? { post } : { error: "facebook_post_page_mismatch" };
}

async function findPagePostByUrl(
  submittedUrls: string[],
  pageId: string,
  token: string,
): Promise<{ post?: GraphPagePost; error?: string }> {
  const params = new URLSearchParams({
    fields: "id,permalink_url,from{id},created_time",
    limit: "50",
  });
  let next: URL | null = new URL(
    `https://graph.facebook.com/${graphVersion()}/${pageId}/feed?${params}`,
  );
  for (let page = 0; next && page < 3; page += 1) {
    if (next.protocol !== "https:" || !graphHost(next.hostname)) {
      return { error: "facebook_feed_lookup_unsafe_paging_url" };
    }
    const result = await graphJson(next, token);
    if (!result.ok) {
      return { error: `facebook_feed_lookup_${result.status}:${result.data?.error?.message || "failed"}` };
    }
    for (const item of Array.isArray(result.data?.data) ? result.data.data : []) {
      const post = validatedGraphPagePost(item, pageId);
      if (!post) continue;
      const graphStoryId = post.id.split("_")[1];
      if (sameFacebookPost(submittedUrls, post.permalinkUrl, graphStoryId)) return { post };
    }
    const pagingUrl = typeof result.data?.paging?.next === "string" ? result.data.paging.next : "";
    if (!pagingUrl) break;
    try {
      next = new URL(pagingUrl);
    } catch {
      return { error: "facebook_feed_lookup_unsafe_paging_url" };
    }
  }
  return {};
}

/**
 * Verify the owner's already-created post instead of creating one. Post ID is
 * optional: when omitted, resolve it from the copied URL using the configured
 * Page feed. Every accepted Graph object must belong to that Page.
 */
export async function verifyPagePost(
  postId: string | null | undefined,
  submittedUrl: string,
): Promise<FbPagePostResult> {
  if (!facebookReady()) return { ok: false, error: "facebook_not_configured" };
  if (!isFacebookUrl(submittedUrl)) return { ok: false, error: "invalid_facebook_url" };

  const pageId = process.env.FACEBOOK_PAGE_ID!;
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN!;
  try {
    const suppliedPostId = String(postId || "").trim();
    const resolvedUrl = facebookStoryIdFromUrl(submittedUrl)
      ? submittedUrl
      : await resolveFacebookWebUrl(submittedUrl);
    const submittedUrls = Array.from(new Set([submittedUrl, resolvedUrl].filter(Boolean))) as string[];

    if (suppliedPostId) {
      const normalizedPostId = normalizePagePostId(suppliedPostId, pageId);
      if (!normalizedPostId) return { ok: false, error: "post_id_not_on_configured_page" };
      const lookup = await lookupPagePostById(normalizedPostId, pageId, token);
      if (!lookup.post) return { ok: false, error: lookup.error || "facebook_post_not_verified" };
      const graphStoryId = lookup.post.id.split("_")[1];
      if (!sameFacebookPost(submittedUrls, lookup.post.permalinkUrl, graphStoryId)) {
        return {
          ok: false,
          error: resolvedUrl ? "facebook_post_url_mismatch" : "facebook_share_url_unresolved",
        };
      }
      return { ok: true, postId: lookup.post.id, permalinkUrl: lookup.post.permalinkUrl };
    }

    const numericStoryId = submittedUrls
      .map(facebookStoryIdFromUrl)
      .find((value): value is string => !!value && /^\d+$/.test(value));
    if (numericStoryId) {
      const direct = await lookupPagePostById(`${pageId}_${numericStoryId}`, pageId, token);
      if (direct.post && sameFacebookPost(submittedUrls, direct.post.permalinkUrl, numericStoryId)) {
        return { ok: true, postId: direct.post.id, permalinkUrl: direct.post.permalinkUrl };
      }
    }

    const found = await findPagePostByUrl(submittedUrls, pageId, token);
    if (found.post) {
      return { ok: true, postId: found.post.id, permalinkUrl: found.post.permalinkUrl };
    }
    if (found.error) return { ok: false, error: found.error };
    if (!resolvedUrl && !facebookStoryIdFromUrl(submittedUrl)) {
      return { ok: false, error: "facebook_share_url_unresolved" };
    }
    return { ok: false, error: "facebook_post_not_found_from_url" };
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
