// weft-theme: the static rules for Weft themes (SPEC.md §12), for weft-check
// and anyone building a theme. A copy of what Aegis × Burrow's aegis/themes.mjs
// does before anything runs: the .theme manifest, which files a theme may
// replace, the syntax of its scripts, the safety scan, and making and checking
// a .stability file. Zero dependencies (Node 18+).
//
//   import { checkFolder, makeStability, verifyStability } from "./weft-theme.mjs";

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

export const API = 1;                        // the theme API this host speaks (manifest "api")
export const MANIFEST = ".theme";
export const STABILITY = ".stability";
export const WEFT_REPO = "alexd-aero/weft";  // Discover: its forks with a .theme, and its examples/themes
const ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
const TOKEN = /^[0-9a-f]{24}$/;

// The pages a theme may draw, the scripts and styles it may replace, and its own files.
export const PAGES = ["home", "tunnels", "settings", "welcome"];
export const REPLACEABLE = new Set([
  "home.html", "tunnels.html", "settings.html", "welcome.html",
  "common.js", "home.js", "tunnels.js", "settings.js", "welcome.js", "fleet.js", "distros.js", "themes.js", "ui.css",
]);
// never: the pages and scripts that see a password being typed
export const PROTECTED = new Set(["login.html", "login.js", "login.css", "setup.html", "unlock.html"]);
const LOGO = /^logos\/[a-z0-9-]{1,40}\.(svg|png|webp)$/;
export const TYPES = {
  ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8", ".json": "application/json", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".avif": "image/avif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp4": "video/mp4", ".webm": "video/webm",
};
export const LIMITS = { files: 2000, total: 60 << 20, file: 25 << 20, preview: 5 << 20, previews: 8, recommended: 24, onboarding: 8, depth: 3 };
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;

export class ThemeError extends Error { constructor(m, extra) { super(m); this.extra = extra || {}; } }
const fail = (m, extra) => { throw new ThemeError(m, extra); };
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const str = (v, n) => typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : "";
const okPath = (p) => typeof p === "string" && !!p && !p.startsWith("/") && !p.split(/[\\/]/).includes("..") && !/^[A-Za-z]:/.test(p) && !p.includes("\0");
const posix = (p) => p.split(sep).join("/");

// ---------------------------------------------------------------- versions
export const verTuple = (v) => String(v || "").split(/[.+-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
export function verCmp(a, b) { const x = verTuple(a), y = verTuple(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; }
// ">=2.45.0", ">=2.45.0 <3", "2.45.x" (a small subset of semver ranges; the rest is refused)
export function satisfies(version, range) {
  if (!range) return true;
  return String(range).trim().split(/\s+/).every((part) => {
    const m = /^(>=|<=|>|<|=)?v?(\d+(?:\.\d+){0,2})(?:\.x)?$/.exec(part);
    if (!m) return false;
    const c = verCmp(version, m[2]);
    return { ">=": c >= 0, "<=": c <= 0, ">": c > 0, "<": c < 0, "=": c === 0, undefined: c === 0 }[m[1]];
  });
}

// ---------------------------------------------------------------- the manifest
// -> {m, errors: [], warnings: []}; m is the cleaned manifest (null when it can't be used)
export function readManifest(text, { pkg = null } = {}) {
  const errors = [], warnings = [];
  let raw;
  try { raw = JSON.parse(text); } catch (e) { return { m: null, errors: [`${MANIFEST} is not valid JSON: ${e.message}`], warnings }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { m: null, errors: [`${MANIFEST} must be a JSON object.`], warnings };
  if (raw.weft !== 1) errors.push(`"weft" must be 1 (the Weft spec this theme follows).`);
  if (raw.kind !== "theme") errors.push(`"kind" must be "theme".`);
  if (!ID.test(raw.id || "")) errors.push(`"id" must look like my-theme: 2-40 lowercase letters, digits and dashes.`);
  const name = str(raw.name, 60); if (!name) errors.push(`"name" is required (60 characters at most).`);
  const version = str(raw.version, 30); if (!/^\d+\.\d+\.\d+([.+-][0-9A-Za-z.-]+)?$/.test(version)) errors.push(`"version" must be a version like 1.0.0.`);
  if (raw.api !== API) errors.push(raw.api > API ? `It is made for theme API ${raw.api}; this Aegis speaks ${API}. Update Aegis first.` : `"api" must be ${API}.`);
  const root = raw.root == null || raw.root === "" || raw.root === "./" ? "." : raw.root;
  if (!okPath(root) && root !== ".") errors.push(`"root" must be a folder inside the package.`);
  const homepage = typeof raw.homepage === "string" && /^https?:\/\/\S+$/.test(raw.homepage) ? raw.homepage : null;
  if (raw.homepage && !homepage) warnings.push(`"homepage" isn't an http(s) link; it is left out.`);
  const requires = typeof raw.requires?.burrow === "string" ? raw.requires.burrow.trim().slice(0, 60) : null;
  if (requires && !/^((>=|<=|>|<|=)?v?\d+(\.\d+){0,2}(\.x)?\s*)+$/.test(requires)) errors.push(`"requires.burrow" must be a range like ">=2.45.0".`);
  const accent = /^#[0-9a-fA-F]{6}$/.test(raw.accent || "") ? raw.accent.toLowerCase() : null;
  // previews: at least one, all images inside the package
  const previews = (Array.isArray(raw.previews) ? raw.previews : []).slice(0, LIMITS.previews).map((p) => typeof p === "string" ? { file: p, caption: "" } : { file: p?.file, caption: str(p?.caption, 60) });
  if (!previews.length) errors.push(`Every theme needs a preview: "previews": ["previews/home.webp", …] (pictures of it in use).`);
  for (const p of previews) if (!okPath(p.file) || !IMAGE.test(p.file)) errors.push(`The preview ${JSON.stringify(p.file)} must be a .png, .jpg, .webp, .gif or .avif inside the package.`);
  // backgrounds: the theme draws its own (builtin), and suggests pictures (recommended)
  const bg = raw.backgrounds && typeof raw.backgrounds === "object" ? raw.backgrounds : null;
  const SWATCH = /^[#(),.%\s\w-]{1,400}$/;                 // gradients and colors; no url(), no ;
  const backgrounds = bg ? {
    builtin: (Array.isArray(bg.builtin) ? bg.builtin : []).slice(0, 8).filter((b) => ID.test(b?.id || "") && str(b.name, 30))
      .map((b) => ({ id: b.id, name: str(b.name, 30), swatch: typeof b.swatch === "string" && SWATCH.test(b.swatch) && !/url\s*\(/i.test(b.swatch) ? b.swatch : "#111" })),
    recommended: (Array.isArray(bg.recommended) ? bg.recommended : []).slice(0, LIMITS.recommended)
      .filter((r) => /^https?:\/\/\S{4,1000}$/.test(r?.url || "") && str(r.name, 40))
      .map((r) => ({ name: str(r.name, 40), url: r.url, tags: (Array.isArray(r.tags) ? r.tags : []).map((t) => str(t, 20).toLowerCase()).filter(Boolean).slice(0, 6),
                     preview: okPath(r.preview) && IMAGE.test(r.preview) ? r.preview : null })),
    default: null,
  } : null;
  if (backgrounds) backgrounds.default = backgrounds.builtin.some((b) => b.id === bg.default) ? bg.default : backgrounds.builtin[0]?.id || null;
  const onboarding = (Array.isArray(raw.onboarding) ? raw.onboarding : []).slice(0, LIMITS.onboarding).map((s) => ({
    title: str(s?.title, 60), body: str(s?.body, 600), image: okPath(s?.image) && IMAGE.test(s.image) ? s.image : null,
    button: s?.button && str(s.button.label, 24) && (/^\/__gate\/[\w#/?=&.-]*$/.test(s.button.href || "") || /^\/$/.test(s.button.href || "") || /^https:\/\/\S+$/.test(s.button.href || ""))
      ? { label: str(s.button.label, 24), href: s.button.href } : null,
  })).filter((s) => s.title);
  if (Array.isArray(raw.onboarding) && raw.onboarding.length !== onboarding.length) warnings.push("Some onboarding steps were left out (each needs a title; buttons link inside the dashboard or to https).");
  const m = errors.length ? null : {
    weft: 1, kind: "theme", id: raw.id, name, version, api: API, root: root === "." ? "" : root.replace(/\/+$/, ""),
    description: str(raw.description, 600), author: str(raw.author, 80), license: str(raw.license, 40), homepage, accent,
    requires: requires ? { burrow: requires } : null, previews, backgrounds, onboarding,
  };
  if (m && pkg) {
    for (const p of [...m.previews.map((x) => x.file), ...m.onboarding.map((s) => s.image), ...(m.backgrounds?.recommended || []).map((r) => r.preview)].filter(Boolean)) {
      let st = null;
      try { st = statSync(join(pkg, p)); } catch { /* missing */ }
      if (!st?.isFile()) errors.push(`${p} is named in ${MANIFEST} but isn't in the package.`);
      else if (st.size > LIMITS.preview) errors.push(`${p} is larger than ${LIMITS.preview >> 20} MB.`);
    }
    if (m.root && !existsSync(join(pkg, m.root))) errors.push(`"root" points to ${m.root}/, which isn't in the package.`);
  }
  return { m: errors.length ? null : m, errors, warnings };
}

// ---------------------------------------------------------------- files
// Every file in the package (posix paths), refusing links and anything too big.
export function listFiles(pkg) {
  const out = [];
  let total = 0;
  (function walk(d, depth) {
    if (depth > 12) fail("The theme's folders nest too deep.");
    for (const n of readdirSync(d).sort()) {
      if (n === ".git") continue;
      const f = join(d, n), st = lstatSync(f);
      if (st.isSymbolicLink()) fail(`${posix(relative(pkg, f))} is a link; themes can't hold links.`);
      if (st.isDirectory()) { walk(f, depth + 1); continue; }
      if (!st.isFile()) continue;
      if (st.size > LIMITS.file) fail(`${posix(relative(pkg, f))} is larger than ${LIMITS.file >> 20} MB.`);
      total += st.size;
      if (total > LIMITS.total) fail(`The theme is larger than ${LIMITS.total >> 20} MB.`);
      out.push({ path: posix(relative(pkg, f)), size: st.size });
      if (out.length > LIMITS.files) fail(`The theme holds more than ${LIMITS.files} files.`);
    }
  })(pkg, 0);
  return out;
}
// What the theme's root holds, sorted into what the dashboard will use.
export function sortFiles(m, files) {
  const root = m.root ? m.root + "/" : "";
  const replaces = [], adds = [], assets = [], ignored = [];
  for (const f of files) {
    if (!f.path.startsWith(root) || f.path === MANIFEST || f.path === STABILITY) continue;
    const rel = f.path.slice(root.length);
    if (PROTECTED.has(rel)) { ignored.push({ ...f, rel, why: "a sign-in page: themes never replace those" }); continue; }
    if (REPLACEABLE.has(rel) || LOGO.test(rel)) { replaces.push({ ...f, rel }); continue; }
    if (rel === "theme.css") { adds.push({ ...f, rel }); continue; }          // layered on top of ui.css: the easy way to restyle
    if (rel.startsWith("assets/") && TYPES[extname(rel).toLowerCase()]) { assets.push({ ...f, rel }); continue; }
    if (rel.split("/").length === 1 && /^(readme|license|changelog)(\.\w+)?$/i.test(rel)) continue;
    if (!rel.startsWith("previews/")) ignored.push({ ...f, rel, why: TYPES[extname(rel).toLowerCase()] ? "not something a theme replaces (extra files go in assets/)" : "a file type themes can't serve" });
  }
  const pages = PAGES.filter((p) => replaces.some((f) => f.rel === `${p}.html` || f.rel === `${p}.js`));
  const code = replaces.concat(assets).filter((f) => /\.(m?js|html)$/.test(f.rel));
  return { replaces, adds, assets, ignored, pages, stylesOnly: !code.length, layered: adds.length > 0 };
}

// ---------------------------------------------------------------- the safety scan
// What the theme's code could do, read statically. A theme that only brings
// styles can't run anything. A theme with scripts runs inside your dashboard,
// signed in as you: the scan says what it touches and flags what a look
// shouldn't need. Levels: danger (stop and think), warn (worth knowing), info.
const SENSITIVE = [
  [/\/api\/password\b/, "changes your password"], [/\/api\/devices\b/, "lists or signs out your devices"],
  [/\/api\/fleet\b/, "manages your linked machines"], [/\/api\/termix\/(install|remove)\b/, "installs or removes Termix"],
  [/\/api\/update\/(apply|rollback|hold)\b/, "updates or rolls back Aegis"], [/\/api\/(domains|cf|relay\/setup)\b/, "changes your domain setup"],
  [/\/api\/addons\b/, "installs, updates or runs addons"], [/\/api\/pack\b/, "installs the full pack"], [/\/api\/themes\b/, "installs or applies themes"],
  [/\/api\/backdrops\b/, "manages your backgrounds"],
];
export function safetyScan(pkg, m, sorted) {
  const out = [], seen = new Set();
  const add = (level, what, file, detail) => { const k = `${level}|${what}|${file}`; if (!seen.has(k)) { seen.add(k); out.push({ level, what, file, detail: detail || "" }); } };
  if (sorted.stylesOnly) add("info", "Styles only: it can't run any code", "", "");
  if (sorted.pages.includes("settings")) add("warn", "It draws your Settings page, so it handles your password, domain and update forms", "settings", "");
  if (sorted.pages.includes("tunnels")) add("warn", "It draws Burrow, so it handles tunnel passwords and can delete tunnels", "tunnels", "");
  for (const f of [...sorted.replaces, ...sorted.adds, ...sorted.assets]) {
    if (!/\.(m?js|html|css|svg)$/i.test(f.rel)) continue;
    const text = readFileSync(join(pkg, f.path), "utf8");
    const lineOf = (i) => text.slice(0, i).split("\n").length;
    const find = (re) => { const x = re.exec(text); return x ? lineOf(x.index) : 0; };
    const ln = (n) => (n ? `line ${n}` : "");
    if (/\.css$/i.test(f.rel)) {
      const ext = /url\(\s*["']?(https?:)?\/\/([^/"')\s]+)/i.exec(text);
      if (ext) add("info", `Points at ${ext[2]}; the dashboard's rules block other sites, so it won't load`, f.rel, ln(lineOf(ext.index)));
      if (/@import\s+(url\()?["']?(https?:)?\/\//i.test(text)) add("info", "Imports a stylesheet from another site; it is blocked", f.rel, "");
      continue;
    }
    if (/\.svg$/i.test(f.rel)) { if (/<script|on\w+\s*=/i.test(text)) add("info", "An SVG with scripts; they never run (served sandboxed)", f.rel, ""); continue; }
    let n;
    if ((n = find(/\beval\s*\(|\bnew\s+Function\s*\(|(?<![\w.$])Function\s*\(\s*["'`]|set(?:Timeout|Interval)\s*\(\s*["'`]/))) add("danger", "Runs code made from text (eval, new Function)", f.rel, ln(n));
    if ((n = find(/document\.cookie/))) add("warn", "Reads or writes cookies", f.rel, ln(n));
    if ((n = find(/navigator\.credentials|PasswordCredential/))) add("danger", "Asks the browser for saved passwords", f.rel, ln(n));
    if ((n = find(/sendBeacon\s*\(/))) add("warn", "Sends data in the background (sendBeacon)", f.rel, ln(n));
    if ((n = find(/postMessage\s*\([^)]*,\s*["']\*["']/))) add("warn", "Talks to any page that embeds it (postMessage to *)", f.rel, ln(n));
    if ((n = find(/new\s+(WebSocket|EventSource)\s*\(\s*["'`](wss?|https?):\/\//))) add("warn", "Opens a connection to another site; the dashboard's rules block it", f.rel, ln(n));
    const hosts = new Set([...text.matchAll(/["'`](?:https?:)?\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)].map((x) => x[1].toLowerCase()).filter((h) => !/^(www\.w3\.org|github\.com|gitlab\.com)$/.test(h)));
    if (hosts.size) add("info", `Mentions ${[...hosts].slice(0, 3).join(", ")}${hosts.size > 3 ? ` and ${hosts.size - 3} more` : ""}; the dashboard's rules keep it from loading anything from them`, f.rel, "");
    if (/\.html$/i.test(f.rel) && /<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(text)) add("info", "Inline scripts never run here (the dashboard allows only its own files)", f.rel, "");
    if (/\.html$/i.test(f.rel) && /<(iframe|object|embed)\b/i.test(text)) add("warn", "Embeds another page (iframe, object or embed)", f.rel, "");
    // hard to read: minified, packed or obfuscated code hides what it does
    const long = text.split("\n").filter((l) => l.length > 3000).length;
    const hex = (text.match(/\\x[0-9a-f]{2}/gi) || []).length;
    if (/\batob\s*\(\s*["'`][A-Za-z0-9+/=]{200,}/.test(text) || hex > 200 || /String\.fromCharCode\((\s*\d+\s*,){40,}/.test(text)) add("danger", "Hides what it does (packed or obfuscated code)", f.rel, "");
    else if (long) add("warn", "Hard to read (minified): the scan can't vouch for it line by line", f.rel, `${long} very long line${long === 1 ? "" : "s"}`);
    for (const [re, what] of SENSITIVE) {
      const at = find(re);
      if (!at) continue;
      const page = PAGES.find((p) => f.rel === `${p}.js`);
      const expected = (page === "settings" && /password|domain|update|termix|devices|pack|themes|backgrounds/i.test(what)) || (page === "tunnels" && /addons|machines/i.test(what))
        || (f.rel === "common.js" && /addons|update|backgrounds/i.test(what)) || (f.rel === "fleet.js" && /machines|addons/i.test(what)) || (f.rel === "themes.js" && /themes|backgrounds/i.test(what))
        || (f.rel === "home.js" && /termix|addons|backgrounds/i.test(what)) || (f.rel === "welcome.js" && /termix|addons|pack|domain/i.test(what));
      add(expected ? "info" : "warn", expected ? `${what[0].toUpperCase()}${what.slice(1)}, as the page it replaces does` : `${what[0].toUpperCase()}${what.slice(1)} (the page it replaces doesn't need to)`, f.rel, ln(at));
    }
  }
  const level = out.some((x) => x.level === "danger") ? "danger" : out.some((x) => x.level === "warn") ? "review" : sorted.stylesOnly ? "styles" : "clean";
  return { level, findings: out.sort((a, b) => "dwi".indexOf(a.level[0]) - "dwi".indexOf(b.level[0])) };
}

// ---------------------------------------------------------------- syntax
// Every script must parse as a module (it is loaded as one).
export function syntaxCheck(pkg, files, node = process.execPath) {
  const bad = [];
  let n = 0;
  for (const f of files) {
    if (!/\.m?js$/i.test(f.rel || f.path)) continue;
    n++;
    const r = spawnSync(node, ["--input-type=module", "--check", "-"], { input: readFileSync(join(pkg, f.path)), timeout: 20000, encoding: "utf8" });
    if (r.status !== 0) bad.push({ file: f.rel || f.path, error: String(r.stderr || r.error?.message || "").split("\n").filter(Boolean).slice(0, 4).join(" ").slice(0, 300) });
  }
  return { scripts: n, bad };
}

// ---------------------------------------------------------------- .stability
// lines: [["weft-stability","1"], ["theme", id, version], ...]; a value may hold spaces (the rest of the line)
export function hashes(pkg, files) {
  return files.filter((f) => f.path !== STABILITY).map((f) => ({ path: f.path, size: f.size, sha: sha(readFileSync(join(pkg, f.path))) }));
}
export function makeStability({ m, host, version, made = new Date(), by, checks, files }) {
  const lines = [
    "weft-stability 1",
    `theme ${m.id} ${m.version}`,
    `api ${m.api}`,
    `host ${host} ${version}`,
    `made ${made.toISOString()}`,
    `by ${String(by || "").replace(/\s+/g, " ").slice(0, 120)}`,
    ...checks.map((c) => `check ${c.id} ${c.ok ? "ok" : "fail"} ${String(c.detail || "").replace(/\s+/g, " ").slice(0, 200)}`.trimEnd()),
    ...files.map((f) => `file ${f.sha} ${f.size} ${f.path}`),
  ];
  return lines.join("\n") + `\nseal ${sha(lines.join("\n"))}\n`;
}
// -> {level: stable|aged|newer|changed|failed|unproven|broken, title, lines: [...], tested?, host?, checks?}
export function verifyStability(pkg, m, files, { host = "burrow", version }) {
  const p = join(pkg, STABILITY);
  if (!existsSync(p)) return { level: "unproven", title: "No .stability file", lines: ["Nobody has proven this build stable yet. It may still work: the live preview shows how it does here."] };
  const text = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const all = text.split("\n").filter((l) => l.length);
  const seal = all.at(-1) || "";
  const body = all.slice(0, -1);
  const broken = (why) => ({ level: "broken", title: "The .stability file is damaged", lines: [why] });
  if (body[0] !== "weft-stability 1") return broken("It doesn't start with \"weft-stability 1\".");
  if (!/^seal [0-9a-f]{64}$/.test(seal)) return broken("Its last line isn't a seal.");
  if (seal.slice(5) !== sha(body.join("\n"))) return { level: "changed", title: "Edited after it was made", lines: ["Its seal doesn't match its lines: someone changed the file by hand, so it proves nothing."] };
  const get = (k) => body.filter((l) => l.startsWith(k + " ")).map((l) => l.slice(k.length + 1));
  const [tid, tver] = (get("theme")[0] || "").split(" ");
  if (tid !== m.id || tver !== m.version) return { level: "changed", title: "Made for another build", lines: [`It is for ${tid || "?"} ${tver || "?"}; this is ${m.id} ${m.version}.`] };
  const [thost, tested] = (get("host")[0] || "").split(" ");
  const checks = get("check").map((l) => { const [id, res, ...rest] = l.split(" "); return { id, ok: res === "ok", detail: rest.join(" ") }; });
  const listed = new Map(get("file").map((l) => { const [h, size, ...rest] = l.split(" "); return [rest.join(" "), { sha: h, size: Number(size) }]; }));
  const now = new Map(hashes(pkg, files).map((f) => [f.path, f]));
  const changed = [], added = [], missing = [];
  for (const [path, f] of now) { const x = listed.get(path); if (!x) added.push(path); else if (x.sha !== f.sha) changed.push(path); }
  for (const path of listed.keys()) if (!now.has(path)) missing.push(path);
  const base = { tested, host: thost, made: get("made")[0] || null, by: get("by")[0] || "", checks };
  if (changed.length || added.length || missing.length) {
    return { ...base, level: "changed", title: "Changed since it was tested", lines: [
      ...changed.slice(0, 5).map((x) => `${x} is different`), ...added.slice(0, 5).map((x) => `${x} was added`), ...missing.slice(0, 5).map((x) => `${x} is missing`)] };
  }
  if (Number(get("api")[0]) !== m.api) return { ...base, level: "changed", title: "Tested on another theme API", lines: [`Tested on theme API ${get("api")[0]}; it says ${m.api}.`] };
  const failed = checks.filter((c) => !c.ok);
  if (failed.length) return { ...base, level: "failed", title: "Its own test failed", lines: failed.map((c) => `${c.id}: ${c.detail || "failed"}`) };
  if (thost !== host) return { ...base, level: "aged", title: `Tested on ${thost}, not here`, lines: [`Proven on ${thost} ${tested}. This is ${host} ${version}.`] };
  const [a, b] = [verTuple(tested), verTuple(version)];
  const lines = [`Every file matches the tested build (${now.size} files).`, ...checks.map((c) => `✓ ${c.id}${c.detail ? `: ${c.detail}` : ""}`)];
  if (a[0] === b[0] && a[1] === b[1]) return { ...base, level: "stable", title: `Stable on Aegis × Burrow ${tested}`, lines };
  if (verCmp(tested, version) > 0) return { ...base, level: "newer", title: `Proven on a newer Aegis (${tested})`, lines: [`You run ${version}: update Aegis to be on the tested version.`, ...lines] };
  return { ...base, level: "aged", title: `Proven on ${tested}; you run ${version}`, lines: ["Most likely fine: the live preview shows how it does on this version.", ...lines] };
}

// ---------------------------------------------------------------- the stand-alone check (aegis themes check DIR, weft-check --theme)
// -> {ok, m, errors, warnings, files, sorted, syntax, safety, stability}
export function checkFolder(pkg, { version = "0.0.0" } = {}) {
  if (!existsSync(join(pkg, MANIFEST))) return { ok: false, errors: [`No ${MANIFEST} in ${pkg}.`], warnings: [] };
  const { m, errors, warnings } = readManifest(readFileSync(join(pkg, MANIFEST), "utf8"), { pkg });
  if (!m) return { ok: false, errors, warnings };
  const files = listFiles(pkg), sorted = sortFiles(m, files);
  if (!sorted.replaces.length && !sorted.adds.length) errors.push("It doesn't change anything the dashboard draws (theme.css, ui.css, a page or a script).");
  const syntax = syntaxCheck(pkg, [...sorted.replaces, ...sorted.assets]);
  for (const b of syntax.bad) errors.push(`${b.file} doesn't parse: ${b.error}`);
  const safety = safetyScan(pkg, m, sorted);
  const stability = verifyStability(pkg, m, files, { version });
  return { ok: !errors.length, m, errors, warnings, files, sorted, syntax, safety, stability };
}
