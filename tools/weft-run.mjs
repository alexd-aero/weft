#!/usr/bin/env node
// weft-run: play a Weft host for one addon, so its scripts can be run and
// tested without Selkies Forge or Aegis × Burrow.
//
//   node tools/weft-run.mjs <addon folder> <detect|install|update|status|uninstall|action ID>
//        [--host selkies-forge|burrow] [--bind ADDR] [--set KEY=VALUE]... [--adopt] [--purge]
//
// It sets the same environment a real host sets (ADDON_*, the FORGE_ADDON_*
// twins, ADDON_HOST…), runs the script with bash from the addon's folder, and
// reads the "::" lines the way the hosts do. Data lives in .weft-dev/<id>/data
// (next to tools/), settings you pass with --set are remembered there.
// It does not provide FORGE_API or BURROW_SOCKET: an addon that needs its
// host's API is tested in that host.

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const flag = (name) => { const i = args.indexOf(name); if (i >= 0) args.splice(i, 1); return i >= 0; };
const sets = [];
for (let i; (i = args.indexOf("--set")) >= 0;) sets.push(args.splice(i, 2)[1]);
const host = opt("--host") || "selkies-forge", bind = opt("--bind") || "127.0.0.1", adopt = flag("--adopt"), purge = flag("--purge");
const [folder, verb, actionId] = args;
if (!folder || !verb) { console.error("usage: node tools/weft-run.mjs <addon folder> <detect|install|update|status|uninstall|action ID> [--host H] [--set K=V] [--adopt] [--purge]"); process.exit(2); }
if (!["selkies-forge", "burrow"].includes(host)) { console.error("--host is selkies-forge or burrow"); process.exit(2); }

const root = resolve(folder);
const m = JSON.parse(readFileSync(join(root, "forge-addon.json"), "utf8"));
if (m.platforms && !m.platforms.includes(host)) { console.error(`${m.id} is made for ${m.platforms.join(" and ")}, not ${host}`); process.exit(1); }
const dev = join(dirname(fileURLToPath(import.meta.url)), "..", ".weft-dev", m.id);
const data = join(dev, "data");
mkdirSync(data, { recursive: true });
const savedFile = join(dev, "settings.json");
let saved = {};
try { saved = JSON.parse(readFileSync(savedFile, "utf8")); } catch { /* first run */ }
for (const kv of sets) { const [k, ...v] = kv.split("="); saved[k] = v.join("="); }
writeFileSync(savedFile, JSON.stringify(saved, null, 2));

let rel;
if (verb === "action") {
  const a = (m.actions || []).find((x) => x.id === actionId);
  if (!a) { console.error(`no action ${actionId} (has: ${(m.actions || []).map((x) => x.id).join(", ") || "none"})`); process.exit(2); }
  rel = a.script;
} else {
  rel = verb === "update" ? (m.scripts.update || m.scripts.install) : m.scripts[verb];
  if (!rel) { console.error(`${m.id} has no ${verb} script`); process.exit(verb === "detect" ? 1 : 2); }
}

const env = { ...process.env, ADDON_SPEC: "1", ADDON_ID: m.id, ADDON_NAME: m.name, ADDON_VERSION: m.version, ADDON_DIR: root,
              ADDON_DATA: data, ADDON_ADOPT: adopt || verb === "update" ? "1" : "0", ADDON_UPDATE: verb === "update" ? "1" : "0",
              ADDON_KEEP_DATA: purge ? "0" : "1", ADDON_HOST: host, ADDON_HOST_VERSION: host === "burrow" ? "2.0.1" : "1.10.9",
              ADDON_HOST_URL: "", ADDON_BIND: bind };
for (const st of m.settings || []) {
  let v = saved[st.key] ?? st.default ?? "";
  if (st.type === "bool") v = ["1", "true", "yes", "on", true].includes(v) ? "1" : "0";
  env["ADDON_SETTING_" + st.key] = String(v);
}
for (const k of Object.keys(env)) if (k.startsWith("ADDON_") && !k.startsWith("ADDON_HOST")) env["FORGE_" + k] = env[k];
env.FORGE_BIND = env.ADDON_BIND;

console.log(`\x1b[2m· ${m.id} ${m.version}: ${verb}${actionId ? " " + actionId : ""} as ${host} · data ${data}\x1b[0m`);
const p = spawn("bash", [join(root, rel)], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
const lines = [];
let buf = "";
const feed = (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    lines.push(line);
    const d = /^::(progress|phase|open|warn) ?(.*)$/.exec(line);
    if (d) console.log(`\x1b[36m  ${d[1].padEnd(8)} ${d[2]}\x1b[0m`);
    else if (line.startsWith("::")) console.log(`\x1b[33m  unknown directive (hosts ignore it): ${line}\x1b[0m`);
    else console.log(`  ${line}`);
  }
};
p.stdout.setEncoding("utf8"); p.stderr.setEncoding("utf8");
p.stdout.on("data", feed); p.stderr.on("data", feed);
p.on("close", (code) => {
  if (buf) feed("\n");
  if (verb === "status" || verb === "detect") {
    const last = [...lines].reverse().find((l) => /^\s*\{.*\}\s*$/.test(l));
    try { console.log(`\x1b[1m  → ${verb === "detect" ? (code === 0 ? "found" : "not found") : JSON.parse(last).state}\x1b[0m ${last || ""}`); }
    catch { console.log("\x1b[31m  → no JSON line: a status script must end with one\x1b[0m"); }
  }
  if (verb === "uninstall" && purge) rmSync(data, { recursive: true, force: true });
  console.log(`\x1b[2m· exit ${code}\x1b[0m`);
  process.exit(code ?? 1);
});
