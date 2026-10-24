import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_POST_LENGTH, toCommentary, validatePostText } from "../src/linkedin.ts";

test("reserved little-text characters are escaped exactly once", () => {
  assert.equal(toCommentary("Hi (all) - 50% off [today] *now* a_b ~x~ <3 @you {x} a|b c\\d"),
    "Hi \\(all\\) - 50% off \\[today\\] \\*now\\* a\\_b \\~x\\~ \\<3 \\@you \\{x\\} a\\|b c\\\\d");
});

test("plain text, emoji and newlines pass through unchanged", () => {
  assert.equal(toCommentary("Line one\n\nLine two 🚀, done."), "Line one\n\nLine two 🚀, done.");
});

test("hashtags become LinkedIn hashtag templates; mid-word # is escaped", () => {
  assert.equal(toCommentary("#ai is fun\n#buildInPublic"), "{hashtag|\\#|ai} is fun\n{hashtag|\\#|buildInPublic}");
  assert.equal(toCommentary("issue#5 and C#"), "issue\\#5 and C\\#");
  assert.equal(toCommentary("#my_tag"), "{hashtag|\\#|my\\_tag}");
});

test("length validation counts the original text", () => {
  assert.equal(validatePostText("x".repeat(MAX_POST_LENGTH)), null);
  assert.match(validatePostText("x".repeat(MAX_POST_LENGTH + 1))!, /limit/);
  assert.match(validatePostText("   ")!, /empty/);
});
