// Usage: npm run beta:aprovar -- pessoa@exemplo.com [outra@exemplo.com ...]
// Approves e-mails for the closed beta in the remote D1, adding them to the waitlist when missing.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const emails = process.argv.slice(2).map((value) => value.trim().toLowerCase());
if (!emails.length || emails.some((email) => email.length > 254 || !EMAIL.test(email))) {
  console.error("Informe um ou mais e-mails válidos: npm run beta:aprovar -- pessoa@exemplo.com");
  process.exit(1);
}

// The strict pattern above excludes quotes, so each value is safe inside a SQL string literal.
const statements = emails.map((email) => `INSERT INTO waitlist_entries
  (id, email, name, campaigns_per_month, consent_version, source, approved_at)
  VALUES (lower(hex(randomblob(16))), '${email}', 'Convite', 'none', 'admin-invite', 'convite', strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT(email) DO UPDATE SET approved_at=COALESCE(approved_at, excluded.approved_at),
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now');`).join("\n");

// On Windows npx needs a shell, which would split an inline SQL argument, so the statements go through a file.
const folder = mkdtempSync(join(tmpdir(), "nivel-beta-"));
const file = join(folder, "approve.sql");
writeFileSync(file, statements);
const result = spawnSync("npx", ["wrangler", "d1", "execute", "nivel-creator", "--remote", "--yes", `--file=${file}`],
  { stdio: "inherit", shell: process.platform === "win32" });
rmSync(folder, { recursive: true, force: true });
if (result.status === 0) console.log(`Aprovado(s) para o beta: ${emails.join(", ")}`);
process.exit(result.status ?? 1);
