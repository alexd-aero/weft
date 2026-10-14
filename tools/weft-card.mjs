#!/usr/bin/env node
// weft-card: see an addon's update card before you publish it (SPEC 2.1).
//
//   node tools/weft-card.mjs <addon folder> [--from 1.0.0] [--to 1.1.0] [-o card.html]
//
// Writes one HTML page (no network, no dependencies): the card as a host draws
// it, in the style you picked, then every style side by side, on the dark
// dashboard Aegis × Burrow uses. Run weft-check first: this tool trusts the
// manifest's update_card and only fills in what's missing.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const folder = args.find((a, i) => !a.startsWith("-") && !["--from", "--to", "-o"].includes(args[i - 1]));
if (!folder) { console.error("usage: node tools/weft-card.mjs <addon folder> [--from 1.0.0] [--to 1.1.0] [-o card.html]"); process.exit(2); }
const root = resolve(folder);
const m = JSON.parse(readFileSync(join(root, "forge-addon.json"), "utf8"));
const card = m.update_card || {};
const from = opt("--from", m.version || "1.0.0");
const to = opt("--to", bump(from));
const out = opt("-o", null);

function bump(v) { const p = String(v).split(".").map((x) => Number(x) || 0); while (p.length < 3) p.push(0); p[1]++; p[2] = 0; return p.slice(0, 3).join("."); }
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// the same looks a host uses (Aegis × Burrow public/ui.css)
const THEMES = {
  green: ["#3ddc97", "#7af5c0", "#16a868", "#03140b"], red: ["#ff5a52", "#ff9b8f", "#d42f3c", "#ffffff"], orange: ["#ff8a3d", "#ffb787", "#e0601c", "#1f0c00"],
  amber: ["#f2c14e", "#ffe08f", "#c9951c", "#1f1500"], blue: ["#5b9bff", "#a3c8ff", "#2f6fe0", "#ffffff"], teal: ["#2dd4bf", "#8af0e2", "#129b8a", "#00201c"],
  purple: ["#a78bfa", "#d2c3ff", "#7c5ce8", "#ffffff"], pink: ["#f472b6", "#ffb3da", "#db3f8f", "#ffffff"], gray: ["#aab1bb", "#dfe3e8", "#7d858f", "#0c0e10"],
};
const URGENT = { security: { theme: "red", badge: "SECURITY", icon: "shield", line: "A security update: install it soon." }, critical: { theme: "red", badge: "CRITICAL", icon: "shield", line: "A critical fix: install it now." },
                 important: { theme: "orange", badge: "IMPORTANT", icon: "bolt" }, recommended: { badge: "RECOMMENDED" } };
const ICONS = {
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.4 7.5 9.5 4.4-1.1 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m8.8 12.2 2.3 2.3 4.3-4.6"/>',
  bolt: '<path d="M13 2.5 4.5 13.5h6.5l-1 8 8.5-11h-6.5l1-8Z"/>',
  spark: '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20Z"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5Z"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.6 2.6l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z"/>',
  rocket: '<path d="M14 4.5c3-1.6 5.4-1.3 5.5-1 .3.1.6 2.5-1 5.5L13 14.5 9.5 11 14 4.5Z"/><path d="M9.5 11 6 11.5 4 14l3.5.5M13 14.5l-.5 3.5L10 20l-.5-3.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  bug: '<rect x="7" y="7.5" width="10" height="12.5" rx="5"/><path d="M12 11v9M7 13H3.5M20.5 13H17"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.download}</svg>`;
function shades(c) {
  if (card.accent) {
    const n = parseInt(card.accent.slice(1), 16), rgb = [n >> 16, (n >> 8) & 255, n & 255];
    const mix = (t, k) => "#" + rgb.map((x) => Math.round(x + (t - x) * k).toString(16).padStart(2, "0")).join("");
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return { upd: card.accent, hi: mix(255, 0.4), deep: mix(0, 0.3), ink: lum > 0.55 ? mix(0, 0.88) : "#ffffff", rgb: rgb.join(",") };
  }
  const t = THEMES[c] || THEMES.green, n = parseInt(t[0].slice(1), 16);
  return { upd: t[0], hi: t[1], deep: t[2], ink: t[3], rgb: [n >> 16, (n >> 8) & 255, n & 255].join(",") };
}
const u = URGENT[card.urgency] || {};
const look = { theme: card.theme || u.theme || "green", icon: card.icon || u.icon || "download", badge: card.badge != null ? card.badge : u.badge || "NEW", line: u.line || "" };
const fill = (t) => String(t).replaceAll("{name}", m.name).replaceAll("{version}", to).replaceAll("{from}", from);
const logo = m.logo && existsSync(join(root, m.logo)) && /\.svg$/i.test(m.logo)
  ? `<img class="lg" alt="" src="data:image/svg+xml;base64,${readFileSync(join(root, m.logo)).toString("base64")}">` : "";
function render(style) {
  const s = shades(look.theme);
  const title = card.title ? esc(fill(card.title)) : `${esc(m.name)} update`;
  return `<section class="card ${style}" style="--upd:${s.upd};--hi:${s.hi};--deep:${s.deep};--ink:${s.ink};--rgb:${s.rgb}">
    <div class="hero"><div class="orb">${svg(look.icon)}</div>
      <div class="txt"><div class="title">${logo}${title}${look.badge ? ` <span class="chip">${esc(look.badge)}</span>` : ""}</div>
        <div class="sub">${card.tagline ? `<span class="tag">${esc(card.tagline)}</span>` : ""}${look.line ? `<b class="urg">${esc(look.line)}</b> ` : ""}<span class="pill">v${esc(to)}</span> is ready to install. Its settings and everything it set up are kept.
        ${card.highlights?.length ? `<ul>${card.highlights.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div></div>
      <div class="ver">v${esc(from)} → <b>v${esc(to)}</b></div></div>
    <div class="foot"><span class="when">Checked now</span><span class="sp"></span>${card.notes ? '<a class="btn">Release notes</a>' : '<a class="btn">What\'s new</a>'}<a class="btn">Later</a>
      <a class="go">${svg("download")}<span>${esc(card.button ? fill(card.button) : `Update to v${to}`)}</span></a></div></section>`;
}
const yours = card.style || "glow";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.name)} update card</title>
<style>
:root{color-scheme:dark;--text:#eceef0;--muted:#8a8f97;--faint:#555a62;--line:rgba(255,255,255,.07);--line2:rgba(255,255,255,.11)}
*{box-sizing:border-box}body{margin:0;background:#030304;color:var(--text);font:14px/1.5 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;padding:32px 16px}
main{max-width:860px;margin:0 auto;display:grid;gap:18px}h1{font-size:20px;margin:0}h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:18px 0 0}
p{margin:0;color:var(--muted)}code{font:12.5px ui-monospace,Menlo,monospace;color:var(--text)}
.card{display:grid;gap:10px}.hero{position:relative;overflow:hidden;display:flex;align-items:center;gap:18px;padding:20px 22px;border-radius:22px;border:1px solid var(--line2);background:#0e0f11}
.orb{width:56px;height:56px;flex:none;border-radius:50%;display:grid;place-items:center;color:var(--ink);background:radial-gradient(circle at 32% 28%,var(--hi),var(--upd) 55%,var(--deep));box-shadow:0 0 0 6px rgba(var(--rgb),.14),0 0 30px rgba(var(--rgb),.6)}
.orb svg{width:26px;height:26px}.txt{flex:1;min-width:0;display:grid;gap:4px}.title{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:19px;font-weight:750;letter-spacing:-.02em}
.lg{width:20px;height:20px;border-radius:5px}.chip{padding:3px 8px;border-radius:999px;background:linear-gradient(135deg,var(--hi),var(--upd));color:var(--ink);font:800 10px/1.3 ui-monospace,monospace;letter-spacing:.14em}
.sub{font-size:13.5px;color:var(--muted)}.tag{display:block;color:var(--text);font-weight:600}.urg{color:var(--hi)}.pill{padding:1px 8px;border-radius:999px;font:700 12px ui-monospace,monospace;background:rgba(var(--rgb),.18);color:var(--hi);border:1px solid rgba(var(--rgb),.5)}
ul{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:4px}li{position:relative;padding-left:16px}li::before{content:"";position:absolute;left:2px;top:.55em;width:6px;height:6px;border-radius:2px;background:var(--upd)}
.ver{flex:none;padding:7px 12px;border-radius:999px;font:600 12.5px ui-monospace,monospace;color:var(--muted);background:rgba(255,255,255,.05);border:1px solid var(--line2)}.ver b{color:var(--text)}
.lbl{margin:6px 0 -8px}.foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.sp{flex:1}.when{font-size:12px;color:var(--faint)}
.btn{height:38px;padding:0 16px;border-radius:999px;border:1px solid var(--line2);background:rgba(255,255,255,.04);display:inline-flex;align-items:center;font-weight:600;font-size:13.5px}
.go{height:42px;padding:0 22px;border-radius:999px;display:inline-flex;align-items:center;gap:8px;font-weight:750;color:var(--ink);background:linear-gradient(135deg,var(--hi),var(--upd) 55%,var(--deep));box-shadow:0 10px 28px -10px rgba(var(--rgb),.9)}.go svg{width:16px;height:16px}
.glow .hero{border-color:rgba(var(--rgb),.6);background:radial-gradient(130% 160% at 0% 0%,rgba(var(--rgb),.28),transparent 55%),radial-gradient(100% 140% at 100% 100%,rgba(var(--rgb),.12),transparent 60%),rgba(var(--rgb),.06);box-shadow:0 22px 60px -22px rgba(var(--rgb),.75)}
.solid .hero{background:linear-gradient(135deg,rgba(var(--rgb),.34),rgba(var(--rgb),.14) 60%,rgba(var(--rgb),.08));border-color:rgba(var(--rgb),.75)}
.outline .hero{background:transparent;border:1.5px solid rgba(var(--rgb),.8)}.outline .orb{background:transparent;color:var(--upd);box-shadow:inset 0 0 0 2px rgba(var(--rgb),.7)}
.minimal .hero{border-left:3px solid var(--upd);padding:14px 18px}.minimal .orb{width:38px;height:38px;box-shadow:none}.minimal .orb svg{width:19px;height:19px}
@media (max-width:620px){.hero{flex-wrap:wrap}.ver{order:3}}
</style></head><body><main>
<div><h1>${esc(m.name)}: its update card</h1><p>From <code>${esc(folder)}/forge-addon.json</code> · <code>update_card</code> ${m.update_card ? "" : "(none: the host's own card)"} · v${esc(from)} → v${esc(to)}</p></div>
<h2>Yours (${esc(yours)})</h2>${render(yours)}
<h2>Every other style</h2>${["glow", "solid", "outline", "minimal"].filter((x) => x !== yours).map((st) => `<p class="lbl"><code>"style": "${st}"</code></p>${render(st)}`).join("")}
</main></body></html>`;
if (out) { writeFileSync(out, html); console.log(`wrote ${out}`); } else process.stdout.write(html);
