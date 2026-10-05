"""Weft Shelf: the Selkies Forge desktops, on a page and on the Weft mesh.

Reads FORGE_API (the host told install where it is; it is in config.json as
forge_api) every 30 s and announces the desktops as "items" of its mesh entry."""
import json
import urllib.request

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "weft"))
import mesh  # noqa: E402  (weft/mesh.py, vendored)

cfg = mesh.load_config(sys.argv[1])
DESKS = []


def poll():
    global DESKS
    api = cfg.get("forge_api") or ""
    if not api:
        raise RuntimeError("no FORGE_API: Weft Shelf runs in Selkies Forge only")
    with urllib.request.urlopen(api + "instances", timeout=8) as r:
        inst = json.load(r).get("instances") or []
    DESKS = [{"name": i.get("name"), "title": i.get("title") or i.get("name"), "running": bool(i.get("running")),
              "url": i.get("local_url")} for i in inst]
    mesh.announce(cfg, "Weft Shelf", ["desktops"], items=DESKS)


class Shelf(mesh.Handler):
    ROUTES = {"/": "home", "/api/desktops": "api"}

    def api(self):
        self.send(200, {"desktops": DESKS})

    def home(self):
        cards = "".join("<div class=card><div class=row><span class='dot %s'></span><b>%s</b></div><div class=mono>%s</div>%s</div>" % (
            "ok" if d["running"] else "", mesh.esc(d["title"]), mesh.esc(d["name"]),
            "<a href='%s'>open</a>" % mesh.esc(d["url"]) if d.get("url") and d["running"] else "<span class=sub>stopped</span>")
            for d in DESKS)
        self.send(200, mesh.page(cfg, "Weft Shelf", "This Selkies Forge's desktops, shared on the Weft mesh",
                                 "<div class=grid>%s</div>" % (cards or "<p class=sub>No desktops yet.</p>"), refresh=15), "text/html")


mesh.heartbeat(poll)
mesh.serve(cfg, Shelf)
