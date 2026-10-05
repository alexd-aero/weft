#!/usr/bin/env node
// weft-check: validate Weft addons statically. Nothing in them is run.
//
//   node tools/weft-check.mjs <addon folder>... [--publish] [--json]
//
// Checks, for each folder:
//   - forge-addon.json, with exactly the rules both Weft hosts enforce
//     (copied from Aegis × Burrow's burrow/addons.mjs, which mirrors
//     Selkies Forge's src/forge/addons.py);
//   - every script it names: present, a bash shebang, `bash -n` clean;
//   - weft/lib.sh and weft/mesh.py, when present, identical to tools/;
//   - requires.forge / requires.burrow match "platforms";
//   - no machine-specific paths (/home/<you>, /Users/…) in scripts;
//   - the credits (README.md naming the Weft Architecture, Selkies Forge and
//     Aegis × Burrow): a warning, or an error with --publish.
// Exit 0 when no folder has an error. Zero dependencies (Node 18+).

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SPEC = 1;
const MANIFEST = "forge-addon.json";
const PLATFORMS = ["selkies-forge", "burrow"];
const HOST = "burrow";
const SELF = ["aegis-burrow", "aegis", "burrow"];
const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const SETTING_RE = /^[A-Z][A-Z0-9_]{0,31}$/;
const ACTION_RE = /^[a-z][a-z0-9-]{0,23}$/;
const SCRIPTS = ["detect", "install", "update", "uninstall", "status"];
const SETTING_TYPES = ["text", "number", "bool", "select", "password"];
const IMAGE_TYPES = { ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
const MAX_IMAGE = 512 * 1024, MAX_MANIFEST = 64 * 1024;
const TIMEOUT = { detect: 20, status: 15, install: 3600, update: 3600, uninstall: 900, action: 900 };
const ARCH_ALIASES = { amd64: "x86_64", x64: "x86_64", arm64: "aarch64", armhf: "armv7l", arm: "armv7l" };
const MASK = "••••••••";

class AddonError extends Error {}
const fail = (msg) => { throw new AddonError(msg); };

// ------------------------------------------------------------------ the manifest (same rules as Selkies Forge)
function inside(root, rel, what, mustExist = true) {
  if (typeof rel !== "string" || !rel.trim()) fail(`${what} must be a path inside the addon`);
  rel = rel.trim();
  if (rel.startsWith("/") || rel.replace(/\\/g, "/").split("/").includes("..")) fail(`${what} (${rel}) must be a relative path inside the addon`);
  const realRoot = realpathSync(root);
  let p;
  try { p = realpathSync(join(root, rel)); } catch { p = resolve(root, rel); }
  if (p !== realRoot && !p.startsWith(realRoot + sep)) fail(`${what} (${rel}) points outside the addon`);
  if (mustExist) { let f = false; try { f = statSync(p).isFile(); } catch { /* */ } if (!f) fail(`${what} (${rel}) does not exist`); }
  return rel;
}
function image(root, rel, what) {
  rel = inside(root, rel, what);
  if (!IMAGE_TYPES[extname(rel).toLowerCase()]) fail(`${what} must be .svg, .png, .webp or .jpg`);
  if (statSync(join(root, rel)).size > MAX_IMAGE) fail(`${what} is larger than ${MAX_IMAGE / 1024} KB`);
  return rel;
}
function text(d, key, limit, required = false) {
  const v = d[key];
  if (v == null || v === "") { if (required) fail(`forge-addon.json needs "${key}"`); return ""; }
  if (typeof v !== "string") fail(`"${key}" must be text`);
  if (v.trim().length > limit) fail(`"${key}" is longer than ${limit} characters`);
  return v.trim();
}
function url(v, what) {
  if (typeof v !== "string" || !/^https?:\/\/\S+$/.test(v.trim())) fail(`${what} must be an http(s) link`);
  return v.trim();
}
function versionTuple(v) {
  const out = [];
  for (const part of String(v || "0").split(/[.+-]/)) { if (!/^\d+$/.test(part)) break; out.push(Number(part)); }
  while (out.length < 3) out.push(0);
  return out;
}
const vcmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

function coerce(st, v) {
  if (st.type === "bool") return typeof v === "string" ? ["1", "true", "yes", "on"].includes(v.trim().toLowerCase()) : !!v;
  if (st.type === "number") {
    const n = Number(v);
    if (v === "" || v == null || Number.isNaN(n)) fail(`${st.label} must be a number`);
    if (("min" in st && n < st.min) || ("max" in st && n > st.max)) fail(`${st.label} must be between ${st.min ?? n} and ${st.max ?? n}`);
    return n;
  }
  v = v == null ? "" : String(v);
  if (st.type === "select" && !st.options.some((o) => o.value === v)) fail(`${st.label}: pick one of the options`);
  if (v.length > 2000) fail(`${st.label} is too long`);
  return v;
}

function loadManifest(root) {
  const path = join(root, MANIFEST);
  let size;
  try { size = statSync(path).size; } catch { fail(`No ${MANIFEST} here. An addon needs one at its root (see the Addons docs).`); }
  if (size > MAX_MANIFEST) fail(`${MANIFEST} is larger than 64 KB`);
  let d;
  try { d = JSON.parse(readFileSync(path, "utf8")); } catch (e) { fail(`${MANIFEST} is not valid JSON: ${e.message}`); }
  if (!d || typeof d !== "object" || Array.isArray(d)) fail(`${MANIFEST} must be a JSON object`);
  if (d.spec !== SPEC) {
    if (Number.isInteger(d.spec) && d.spec > SPEC) fail(`This addon needs a newer Burrow (addon spec ${d.spec}; this one reads ${SPEC}).`);
    fail(`forge-addon.json needs "spec": ${SPEC}`);
  }
  const m = { spec: SPEC };
  m.id = text(d, "id", 40, true);
  if (!ID_RE.test(m.id)) fail('"id" must be 2-40 lowercase letters, digits or dashes, starting with a letter or digit');
  m.name = text(d, "name", 60, true);
  m.version = text(d, "version", 30, true);
  m.description = text(d, "description", 600);
  m.author = text(d, "author", 80);
  m.license = text(d, "license", 40);
  m.homepage = d.homepage ? url(d.homepage, '"homepage"') : "";
  m.logo = d.logo ? image(root, d.logo, '"logo"') : "";

  const scripts = d.scripts;
  if (!scripts || typeof scripts !== "object" || !scripts.install) fail('forge-addon.json needs "scripts": {"install": "..."}');
  m.scripts = {};
  for (const [k, v] of Object.entries(scripts)) {
    if (!SCRIPTS.includes(k)) fail(`unknown script "${k}" (known: ${SCRIPTS.join(", ")})`);
    m.scripts[k] = inside(root, v, `scripts.${k}`);
  }
  m.actions = [];
  for (const a of d.actions || []) {
    if (!a || typeof a !== "object" || !ACTION_RE.test(String(a.id || ""))) fail('every action needs an "id" (lowercase letters, digits, dashes)');
    if (SCRIPTS.includes(a.id)) fail(`action "${a.id}" has the name of a lifecycle script`);
    m.actions.push({ id: a.id, label: text(a, "label", 24, true), script: inside(root, a.script, `actions.${a.id}.script`), confirm: text(a, "confirm", 200) });
  }
  if (m.actions.length > 8) fail("at most 8 actions");
  m.settings = [];
  const seen = new Set();
  for (const s of d.settings || []) {
    if (!s || typeof s !== "object" || !SETTING_RE.test(String(s.key || ""))) fail('every setting needs a "key" in CAPITALS (A-Z, 0-9, _), e.g. PORT');
    if (seen.has(s.key)) fail(`setting ${s.key} appears twice`);
    seen.add(s.key);
    const type = s.type || "text";
    if (!SETTING_TYPES.includes(type)) fail(`setting ${s.key}: type must be one of ${SETTING_TYPES.join(", ")}`);
    const st = { key: s.key, type, label: text(s, "label", 60, true), help: text(s, "help", 300), default: s.default ?? null, required: !!s.required };
    if (type === "number") for (const k of ["min", "max"]) if (s[k] != null) st[k] = Number(s[k]);
    if (type === "select") {
      st.options = (s.options || []).map((o) => (o && typeof o === "object" ? o : { value: o, label: o }))
        .map((o) => ({ value: String(o.value), label: String(o.label ?? o.value).slice(0, 60) }));
      if (!st.options.length) fail(`setting ${s.key}: a select needs "options"`);
    }
    if (s.icon) st.icon = image(root, s.icon, `setting ${s.key} icon`);
    if (st.default != null) st.default = coerce(st, st.default);
    m.settings.push(st);
  }
  if (m.settings.length > 16) fail("at most 16 settings");

  if (d.platforms == null) m.platforms = [...PLATFORMS];
  else {
    if (!Array.isArray(d.platforms) || !d.platforms.length || !d.platforms.every((x) => typeof x === "string")) fail('"platforms" must be a list, e.g. ["selkies-forge", "burrow"]');
    const bad = d.platforms.find((x) => !PLATFORMS.includes(x));
    if (bad) fail(`unknown platform "${bad}" (known: ${PLATFORMS.join(", ")})`);
    m.platforms = PLATFORMS.filter((x) => d.platforms.includes(x));
  }
  const req = d.requires || {};
  if (typeof req !== "object" || Array.isArray(req)) fail('"requires" must be an object');
  m.requires = {
    forge: String(req.forge || "").trim(), burrow: String(req.burrow || "").trim(),
    os: (req.os || []).map((x) => String(x).toLowerCase()),
    arch: (req.arch || []).map((x) => ARCH_ALIASES[String(x).toLowerCase()] || String(x).toLowerCase()),
    commands: (req.commands || []).map(String).filter((x) => /^[A-Za-z0-9._+-]+$/.test(x)),
  };
  for (const h of ["forge", "burrow"]) if (m.requires[h] && !/^(>=)?\s*\d+(\.\d+){0,2}$/.test(m.requires[h])) fail(`requires.${h} must look like ">=1.10.0"`);
  m.integration = {};
  if (d.integration && Object.keys(d.integration).length) {
    const p = String(d.integration.dir || "");
    if (!(p.startsWith("~/") || p.startsWith("$HOME/")) || p.split("/").includes("..")) fail("integration.dir must be a folder under ~/ (e.g. ~/.config/myapp/integrations)");
    m.integration = { dir: p };
  }
  const rep = d.replaces || [];
  if (!Array.isArray(rep) || rep.length > 8 || !rep.every((x) => typeof x === "string" && ID_RE.test(x))) fail('"replaces" must be a list of addon ids, e.g. ["old-name"]');
  m.replaces = rep.filter((x) => x !== m.id);
  m.links = [];
  for (const ln of (d.links || []).slice(0, 6)) if (ln && typeof ln === "object") m.links.push({ label: text(ln, "label", 40, true), url: url(ln.url, "link url") });
  return m;
}


// ------------------------------------------------------------------ the checks
const TOOLS = dirname(fileURLToPath(import.meta.url));
const CREDITS = [
  [/weft architecture/i, "the Weft Architecture (https://github.com/alexd-aero/weft)"],
  [/selkies forge/i, "Selkies Forge (https://github.com/adatskov-wcpss/animated-fiesta)"],
  [/aegis\s*(×|x)\s*burrow|burrow/i, "Aegis × Burrow (https://github.com/alexd-aero/aegis-burrow)"],
];

function check(folder, { publish }) {
  const root = resolve(folder), errors = [], warnings = [], notes = [];
  let m = null;
  try { m = loadManifest(root); notes.push(`${m.id} ${m.version}: ${m.name} · platforms ${m.platforms.join(" + ")}`); }
  catch (e) { errors.push(e.message); return { folder, ok: false, errors, warnings, notes }; }
  const scripts = [...Object.values(m.scripts), ...m.actions.map((a) => a.script)];
  for (const rel of new Set(scripts)) {
    const p = join(root, rel), text = readFileSync(p, "utf8");
    if (!/^#!\/(usr\/)?bin\/(env )?bash/.test(text)) warnings.push(`${rel}: start it with #!/usr/bin/env bash (hosts run it with bash anyway)`);
    try { execFileSync("bash", ["-n", p], { stdio: "pipe" }); } catch (e) { errors.push(`${rel}: bash -n: ${String(e.stderr || e.message).trim().split("\n")[0]}`); }
    if (/\/home\/[a-z_][a-z0-9_-]*\/|\/Users\/[A-Za-z]/.test(text)) errors.push(`${rel}: a machine-specific path (/home/…): use ADDON_DIR, ADDON_DATA or $HOME`);
    if (/\bsudo\b/.test(text)) warnings.push(`${rel}: sudo: hosts run scripts unattended, as you; a password prompt hangs until the timeout`);
  }
  if (!m.scripts.status) warnings.push("no status script: hosts can only say \"installed\", never running or stopped");
  if (!m.scripts.uninstall) warnings.push("no uninstall script: uninstalling only forgets it");
  if (!m.scripts.detect) notes.push("no detect script: a copy already on the machine can't be linked");
  for (const name of ["lib.sh", "mesh.py"]) {
    const mine = join(root, "weft", name), canon = join(TOOLS, name);
    if (existsSync(mine) && existsSync(canon) && readFileSync(mine, "utf8") !== readFileSync(canon, "utf8")) {
      errors.push(`weft/${name} differs from tools/${name}: copy it again (never edit a vendored copy)`);
    }
  }
  if (m.platforms.includes("selkies-forge") && !m.requires.forge) warnings.push('runs on Selkies Forge: add "requires": {"forge": ">=1.10.0"}');
  if (m.platforms.includes("burrow") && !m.requires.burrow) warnings.push('runs on Burrow: add "requires": {"burrow": ">=2.0.0"}');
  if (!m.platforms.includes("selkies-forge") && m.requires.forge) warnings.push("requires.forge is set, but it isn't made for Selkies Forge");
  if (!m.platforms.includes("burrow") && m.requires.burrow) warnings.push("requires.burrow is set, but it isn't made for Burrow");
  const readme = ["README.md", "readme.md"].map((n) => join(root, n)).find(existsSync);
  const text = readme ? readFileSync(readme, "utf8") : "";
  const missing = CREDITS.filter(([re]) => !re.test(text)).map(([, what]) => what);
  if (!readme) (publish ? errors : warnings).push("no README.md (it carries the credits, see prompt.md)");
  else if (missing.length) (publish ? errors : warnings).push(`README.md doesn't credit ${missing.join(", ")}`);
  return { folder, id: m.id, ok: !errors.length, errors, warnings, notes };
}

const args = process.argv.slice(2);
const flags = { publish: args.includes("--publish"), json: args.includes("--json") };
const folders = args.filter((a) => !a.startsWith("--"));
if (!folders.length) { console.error("usage: node tools/weft-check.mjs <addon folder>... [--publish] [--json]"); process.exit(2); }
const results = folders.map((f) => check(f, flags));
if (flags.json) console.log(JSON.stringify(results, null, 2));
else for (const r of results) {
  console.log(`${r.ok ? "\u2714" : "\u2718"} ${r.folder}`);
  for (const n of r.notes) console.log(`    ${n}`);
  for (const w of r.warnings) console.log(`  ! ${w}`);
  for (const e of r.errors) console.log(`  \u2718 ${e}`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
