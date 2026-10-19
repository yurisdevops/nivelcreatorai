import test from "node:test";
import assert from "node:assert/strict";
import { AuthError } from "../src/auth.js";
import { cleanMediaKit, renderPublicMediaKit } from "../src/mediakit.js";

const base = { display_name: "Ana", slug: "ana.ugc", published: true };

test("media kit slugs are validated and reserved paths are refused", () => {
  assert.equal(cleanMediaKit({ ...base, slug: "@Ana.UGC" }).slug, "ana.ugc");
  for (const slug of ["ab", "api", "lista", "nome com espaço", "<script>"]) {
    assert.throws(() => cleanMediaKit({ ...base, slug }), AuthError);
  }
  assert.throws(() => cleanMediaKit({ ...base, contact_email: "sem-arroba" }), AuthError);
});

test("the public media kit escapes creator text and hides unpublished pages", async () => {
  const row = { workspace_id: "w", slug: "ana.ugc", display_name: "<img src=x onerror=alert(1)>", bio: "Oi & \"tchau\"", city: "",
    contact_email: "ana@example.com", instagram: "ana", brands_json: JSON.stringify(["<b>Marca</b>"]), highlights_json: "[]",
    show_metrics: 0, show_delivered_brands: 0, published: 1, updated_at: "" };
  const db = (found) => ({ prepare: () => ({ bind: () => ({ first: async () => found, all: async () => ({ results: [] }) }) }) });
  const html = await renderPublicMediaKit({ DB: db(row) }, "ana.ugc");
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;b&gt;Marca&lt;\/b&gt;/);
  assert.equal(await renderPublicMediaKit({ DB: db(null) }, "ana.ugc"), null);
  assert.equal(await renderPublicMediaKit({ DB: db(row) }, "../etc"), null);
});

test("media kit portfolio accepts only https links and up to 8 works", () => {
  const kit = cleanMediaKit({ ...base, portfolio_url: "https://drive.google.com/x", portfolio: [{ title: "Review", url: "https://www.instagram.com/reel/abc/" }] });
  assert.equal(kit.portfolio.length, 1);
  assert.throws(() => cleanMediaKit({ ...base, portfolio: [{ title: "x", url: "javascript:alert(1)" }] }), AuthError);
  assert.throws(() => cleanMediaKit({ ...base, portfolio_url: "http://inseguro.example" }), AuthError);
  assert.throws(() => cleanMediaKit({ ...base, portfolio: Array.from({ length: 9 }, () => ({ url: "https://a.example" })) }), AuthError);
});
