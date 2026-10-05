"""Weft Pulse: a live board of the Weft mesh, and of the host that runs it.

Reads every mesh entry (mesh.peers), checks each one's /health at once, and
shows what they provide: Weft Shelf's desktops (items), Weft Relay's public
addresses (routes). Its manifest declares integration.dir, so its host drops a
file describing itself there (Selkies Forge writes selkies-forge.json)."""
import concurrent.futures
import glob
import json
import urllib.request

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "weft"))
import mesh  # noqa: E402  (weft/mesh.py, vendored)

cfg = mesh.load_config(sys.argv[1])
INTEG = cfg.get("integrations") or os.path.expanduser("~/.config/weft/integrations")


def check(p):
    if not p.get("health"):
        return None
    try:
        with urllib.request.urlopen(p["health"], timeout=1.5) as r:
            return r.status == 200
    except Exception:
        return False


def board():
    peers = mesh.peers(cfg, include_stale=True)
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        ups = list(ex.map(check, peers))
    routes = {}
    for p in peers:
        routes.update(p.get("routes") or {})
    hosts = []
    for f in sorted(glob.glob(os.path.join(INTEG, "*.json"))):
        try:
            with open(f) as fh:
                d = json.load(fh)
            hosts.append({k: d.get(k) for k in ("id", "name", "version", "url", "updated")})
        except (OSError, ValueError):
            pass
    return {"peers": [dict(p, up=u, public=routes.get(p["id"])) for p, u in zip(peers, ups)], "hosts": hosts}


class Pulse(mesh.Handler):
    ROUTES = {"/": "home", "/api/mesh": "api"}

    def api(self):
        self.send(200, board())

    def home(self):
        b = board()
        cards = []
        for p in b["peers"]:
            dot = "ok" if p["up"] else ("err" if p["up"] is False else "")
            items = "".join("<li>%s %s</li>" % ("<span class='dot ok'></span>" if i.get("running") else "<span class=dot></span>",
                                                 ("<a href='%s'>%s</a>" % (mesh.esc(i["url"]), mesh.esc(i.get("title") or i.get("name")))) if i.get("url") else mesh.esc(i.get("title") or i.get("name")))
                            for i in p.get("items") or [])
            cards.append("<div class=card><div class=row><span class='dot %s'></span><b>%s</b><span class=pill>%s</span>%s</div>"
                         "<div class=sub>%s</div>%s%s%s</div>" % (
                             dot, mesh.esc(p["name"]), mesh.esc(p.get("version", "")),
                             "<span class='pill warn'>stale</span>" if p["stale"] else "",
                             mesh.esc(", ".join(p.get("provides") or []) or "–") + (" · " + mesh.esc(p["message"]) if p.get("message") else ""),
                             "<div class=mono><a href='%s'>%s</a></div>" % (mesh.esc(p["url"]), mesh.esc(p["url"])) if p.get("url") else "",
                             "<div class=mono>public: <a href='%s'>%s</a></div>" % (mesh.esc(p["public"]), mesh.esc(p["public"])) if p.get("public") else "",
                             "<ul style='margin:8px 0 0;padding-left:18px'>%s</ul>" % items if items else ""))
        hosts = "".join("<span class=pill>%s %s</span> " % (mesh.esc(h["name"]), mesh.esc(h.get("version") or "")) for h in b["hosts"])
        body = ("<div class=row><span class='pill ok'>%d on the mesh</span>%s</div>"
                "<h2>Addons</h2><div class=grid>%s</div>"
                % (len(b["peers"]), (" registered with it: " + hosts) if hosts else "",
                   "".join(cards) or "<p class=sub>Nothing has announced itself yet. Install Weft Beacon.</p>"))
        self.send(200, mesh.page(cfg, cfg.get("title") or "The mesh", "Weft Pulse: every addon on this machine's mesh", body, refresh=10), "text/html")


mesh.heartbeat(lambda: mesh.announce(cfg, "Weft Pulse", ["dashboard"]))
mesh.serve(cfg, Pulse)
