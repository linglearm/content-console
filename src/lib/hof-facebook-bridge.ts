import type { FbPagePostResult } from "./facebook";
import type { HofSection } from "./hof-facebook";
import { buildHofFacebookComments } from "./hof-facebook";

export type HofCommentResult = {
  role: "REFERENCE" | "SAFETY" | "HOW" | "WHY";
  comment_id: string;
  reused: boolean;
};

export type HofFacebookBridgeDeps = {
  verifyPagePost(postId: string, submittedUrl: string): Promise<FbPagePostResult>;
  findExactPostComment(postId: string, message: string): Promise<string | null>;
  commentOnPostDetailed(
    postId: string,
    message: string,
    attachmentUrl?: string,
  ): Promise<{ ok: boolean; commentId?: string; error?: string }>;
};

/**
 * Comment on the owner's already-published post. Dependencies are injected so
 * the full sequence, partial failure, and retry behavior can be unit tested
 * without a Facebook or Production call.
 */
export async function deliverHofFacebookComments(
  input: { postId: string; postUrl: string; sections: HofSection[] },
  deps: HofFacebookBridgeDeps,
): Promise<{
  ok: boolean;
  postId?: string;
  postUrl?: string;
  comments: HofCommentResult[];
  error?: string;
}> {
  const verified = await deps.verifyPagePost(input.postId, input.postUrl);
  if (!verified.ok || !verified.postId || !verified.permalinkUrl) {
    return {
      ok: false,
      comments: [],
      error: verified.error || "facebook_post_not_verified",
    };
  }

  const comments = buildHofFacebookComments(input.sections);
  const results: HofCommentResult[] = [];
  for (const comment of comments) {
    const existingId = await deps.findExactPostComment(verified.postId, comment.message);
    if (existingId) {
      results.push({ role: comment.role, comment_id: existingId, reused: true });
      continue;
    }
    const created = await deps.commentOnPostDetailed(
      verified.postId,
      comment.message,
      comment.imageUrl,
    );
    if (!created.ok || !created.commentId) {
      return {
        ok: false,
        postId: verified.postId,
        postUrl: verified.permalinkUrl,
        comments: results,
        error: `${comment.role}:${created.error || "facebook_comment_failed"}`,
      };
    }
    results.push({ role: comment.role, comment_id: created.commentId, reused: false });
  }

  return {
    ok: true,
    postId: verified.postId,
    postUrl: verified.permalinkUrl,
    comments: results,
  };
}
