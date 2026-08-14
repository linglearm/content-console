import assert from "node:assert/strict";
import test from "node:test";
import { buildHofFacebookComments } from "./hof-facebook";
import { deliverHofFacebookComments } from "./hof-facebook-bridge";
import {
  commentOnPostDetailed,
  facebookStoryIdFromUrl,
  normalizePagePostId,
  verifyPagePost,
} from "./facebook";

test("builds HOF comments in required API order", () => {
  const comments = buildHofFacebookComments([
    { role: "WHY", paras: ["why"], image: "https://img/why.jpg" },
    { role: "REFERENCE", paras: ["ref one", "ref two"] },
    { role: "HOW", paras: ["how"], image: "https://img/how.jpg" },
    { role: "SAFETY", paras: ["safe"], image: "https://img/safe.jpg" },
  ]);
  assert.deepEqual(comments.map((item) => item.role), ["REFERENCE", "SAFETY", "HOW", "WHY"]);
  assert.deepEqual(comments.map((item) => item.message.split("\n")[0]), ["REF", "3/3", "2/3", "1/3"]);
  assert.equal(comments[0].imageUrl, undefined);
});

test("rejects an incomplete package before calling Facebook", () => {
  assert.throws(() => buildHofFacebookComments([
    { role: "REFERENCE", paras: ["ref"] },
    { role: "SAFETY", paras: ["safe"], image: "https://img/safe.jpg" },
    { role: "HOW", paras: ["how"], image: "https://img/how.jpg" },
  ]), /missing_why_comment/);
});

test("normalizes only ids belonging to the configured page", () => {
  assert.equal(normalizePagePostId("456", "123"), null);
  assert.equal(normalizePagePostId("123_456", "123"), "123_456");
  assert.equal(normalizePagePostId("999_456", "123"), null);
});

test("extracts story ids from direct Facebook links", () => {
  assert.equal(facebookStoryIdFromUrl("https://www.facebook.com/123/posts/456"), "456");
  assert.equal(facebookStoryIdFromUrl("https://www.facebook.com/permalink.php?story_fbid=456&id=123"), "456");
  assert.equal(facebookStoryIdFromUrl("https://example.com/123/posts/456"), null);
  assert.equal(facebookStoryIdFromUrl("https://fb.com/123/posts/456"), null);
});

test("requires a permalink carrying the same post identity", async () => {
  process.env.FACEBOOK_PAGE_ID = "123";
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "test-token";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    id: "123_456",
    permalink_url: "https://www.facebook.com/123/posts/456",
    from: { id: "123" },
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const result = await verifyPagePost("123_456", "https://www.facebook.com/share/p/not-verifiable");
    assert.equal(result.error, "facebook_permalink_required");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verifies the Graph post belongs to the page and matches the supplied URL", async () => {
  process.env.FACEBOOK_PAGE_ID = "123";
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "test-token";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    id: "123_456",
    permalink_url: "https://www.facebook.com/123/posts/456",
    from: { id: "123" },
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    assert.equal((await verifyPagePost("123_456", "https://www.facebook.com/123/posts/456")).ok, true);
    assert.equal((await verifyPagePost("123_456", "https://www.facebook.com/123/posts/999")).error, "facebook_post_url_mismatch");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends an image comment using attachment_url", async () => {
  process.env.FACEBOOK_PAGE_ID = "123";
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "test-token";
  const originalFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    body = String(init?.body || "");
    return new Response(JSON.stringify({ id: "comment-1" }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await commentOnPostDetailed("123_456", "3/3\nsafe", "https://img/safe.jpg");
    assert.equal(result.commentId, "comment-1");
    const params = new URLSearchParams(body);
    assert.equal(params.get("message"), "3/3\nsafe");
    assert.equal(params.get("attachment_url"), "https://img/safe.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const completeSections = [
  { role: "REFERENCE", paras: ["ref"] },
  { role: "SAFETY", paras: ["safe"], image: "https://img/safe.jpg" },
  { role: "HOW", paras: ["how"], image: "https://img/how.jpg" },
  { role: "WHY", paras: ["why"], image: "https://img/why.jpg" },
];

test("delivers all comments sequentially and never creates an initial post", async () => {
  const calls: string[] = [];
  const result = await deliverHofFacebookComments({
    postId: "123_456",
    postUrl: "https://www.facebook.com/123/posts/456",
    sections: completeSections,
  }, {
    verifyPagePost: async () => ({ ok: true, postId: "123_456", permalinkUrl: "https://www.facebook.com/123/posts/456" }),
    findExactPostComment: async () => null,
    commentOnPostDetailed: async (_postId, message) => {
      calls.push(message.split("\n")[0]);
      return { ok: true, commentId: `comment-${calls.length}` };
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ["REF", "3/3", "2/3", "1/3"]);
});

test("stops on partial failure and reports only completed comments", async () => {
  const calls: string[] = [];
  const result = await deliverHofFacebookComments({
    postId: "123_456",
    postUrl: "https://www.facebook.com/123/posts/456",
    sections: completeSections,
  }, {
    verifyPagePost: async () => ({ ok: true, postId: "123_456", permalinkUrl: "https://www.facebook.com/123/posts/456" }),
    findExactPostComment: async () => null,
    commentOnPostDetailed: async (_postId, message) => {
      const label = message.split("\n")[0];
      calls.push(label);
      return label === "2/3" ? { ok: false, error: "simulated" } : { ok: true, commentId: `comment-${label}` };
    },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, ["REF", "3/3", "2/3"]);
  assert.deepEqual(result.comments.map(item => item.role), ["REFERENCE", "SAFETY"]);
});

test("reuses exact existing Page comments on retry instead of duplicating them", async () => {
  const created: string[] = [];
  const result = await deliverHofFacebookComments({
    postId: "123_456",
    postUrl: "https://www.facebook.com/123/posts/456",
    sections: completeSections,
  }, {
    verifyPagePost: async () => ({ ok: true, postId: "123_456", permalinkUrl: "https://www.facebook.com/123/posts/456" }),
    findExactPostComment: async (_postId, message) => {
      const label = message.split("\n")[0];
      return label === "REF" || label === "3/3" ? `existing-${label}` : null;
    },
    commentOnPostDetailed: async (_postId, message) => {
      const label = message.split("\n")[0];
      created.push(label);
      return { ok: true, commentId: `new-${label}` };
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(created, ["2/3", "1/3"]);
  assert.deepEqual(result.comments.map(item => item.reused), [true, true, false, false]);
});
