import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  commentOnPostDetailed,
  findExactPostComment,
  verifyPagePost,
} from "@/lib/facebook";
import { deliverHofFacebookComments } from "@/lib/hof-facebook-bridge";

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
 * Facebook comment bridge for Human of Fit.
 *
 * The Jongrak Health webhook deliberately has no Facebook token. It claims a
 * QA-passed article, then sends a short-lived, single-use ticket here. This
 * route claims that ticket through the HOF database, receives the owner-bound
 * Post ID/URL plus immutable comments from the RPC, verifies that the object
 * belongs to the configured Page, then comments REF → 3/3 → 2/3 → 1/3.
 * It never creates the initial Facebook post.
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

  try {
    const result = await deliverHofFacebookComments({
      postId: String(claim.facebook_post_id ?? ""),
      postUrl: String(claim.facebook_post_url ?? ""),
      sections: Array.isArray(claim.sections) ? claim.sections : [],
    }, { verifyPagePost, findExactPostComment, commentOnPostDetailed });
    return NextResponse.json({
      ok: result.ok,
      post_id: result.postId,
      post_url: result.postUrl,
      comments: result.comments,
      ...(result.error ? { error: result.error } : {}),
    }, { status: result.ok ? 200 : 422 });
  } catch (error) {
    console.error("[human-of-fit/facebook] comments", error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? clip(error.message, 300) : "facebook_comments_failed",
      comments: [],
    }, { status: 502 });
  }
}
