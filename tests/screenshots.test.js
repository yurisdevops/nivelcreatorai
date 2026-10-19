import test from "node:test";
import assert from "node:assert/strict";
import { AuthError } from "../src/auth.js";
import { cleanMetrics, screenshotsHandler } from "../src/screenshots.js";

test("confirmed screenshot numbers are validated before saving", () => {
  assert.deepEqual(cleanMetrics({ followers: "1200", reach: 3072.4, views: null, interactions: "", profile_visits: 0 }),
    { followers: 1200, reach: 3072, views: null, interactions: null, profile_visits: 0 });
  assert.throws(() => cleanMetrics({ followers: -1 }), AuthError);
  assert.throws(() => cleanMetrics({}), AuthError);
});

test("screenshot reading refuses files that are not images", async () => {
  const request = new Request("https://app.example/api/instagram/screenshot", { method: "POST",
    headers: { origin: "https://app.example", "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ mime: "text/html", image: "PGh0bWw+" }) });
  await assert.rejects(screenshotsHandler(request, { DB: {} }, "/api/instagram/screenshot", { workspace_id: "w" }),
    (error) => error instanceof AuthError && error.status === 400);
});
