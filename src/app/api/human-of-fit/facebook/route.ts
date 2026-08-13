import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { postToPage } from "@/lib/facebook";

export const dynamic = "force-dynamic";

const HOF_PROJECT_URL = "https://tcghphrgquurioopxxoc.supabase.co";
const HOF_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjZ2hwaHJncXV1cmlvb3B4eG9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTkzMzAsImV4cCI6MjA5Nzg3NTMzMH0.gDzxiExWp69gSBeh5q0TwaEiw9zQTENjuB8SgDd2HSs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TICKET = /^[0-9a-f]{64}$/i;

function clip(value: unknown, max = 500): string {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Facebook credential bridge for Human of Fit.
 *
 * The Jongrak Health webhook deliberately has no Facebook token. It claims a
 * QA-passed article, then sends a short-lived, single-use ticket here. This
 * route claims that ticket through the HOF database, receives immutable post
 * copy from the RPC, and uses the Facebook credential already configured on
 * this Production service. No caller-supplied title, caption, image, or page
 * identifier is accepted.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const articleId = clip(body.article_id, 36).toLowerCase();
  const ticket = clip(body.ticket, 64).toLowerCase();
  if (!UUID.test(articleId) || !TICKET.test(ticket)) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const hof = createClient(HOF_PROJECT_URL, HOF_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: claim, error: claimError } = await hof.rpc("sa_hof_claim_facebook_ticket", {
    p_token: ticket,
    p_article_id: articleId,
  });
  if (claimError || !claim?.ok) {
    console.error("[human-of-fit/facebook] ticket rejected", claimError?.message || claim?.code);
    return NextResponse.json({ ok: false, error: "ticket_rejected" }, { status: 401 });
  }

  const message = [clip(claim.title, 180), clip(claim.description, 300)]
    .filter(Boolean)
    .join("\n\n");
  const imageUrl = /^https:\/\//i.test(String(claim.cover_image ?? ""))
    ? String(claim.cover_image)
    : undefined;

  try {
    const post = await postToPage(message, { imageUrl });
    if (!post.posted || !post.postId || post.postId.startsWith("mock-")) {
      return NextResponse.json({ ok: false, error: "facebook_not_configured" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, post_id: post.postId });
  } catch (error) {
    console.error("[human-of-fit/facebook] publish", error);
    return NextResponse.json({ ok: false, error: "facebook_publish_failed" }, { status: 502 });
  }
}
