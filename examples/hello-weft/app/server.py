"""Hello Weft: a page, a /health endpoint and an entry on the Weft mesh.
Started by weft/lib.sh (service_start) with data/config.json as its argument."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "weft"))
import mesh  # noqa: E402  (weft/mesh.py, vendored)

cfg = mesh.load_config(sys.argv[1])


class Hello(mesh.Handler):
    ROUTES = {"/": "home"}

    def home(self):
        peers = mesh.peers(cfg)
        body = ("<div class=card><p style='font-size:22px;margin:0;letter-spacing:-.01em'>%s</p>"
                "<p class=sub>Set by the GREETING setting. Change it in the host's addon settings, then reinstall.</p></div>"
                "<h2>On the mesh with it</h2><div class=grid>%s</div>"
                % (mesh.esc(cfg.get("greeting") or "Hello"),
                   "".join("<div class=card><b>%s</b> <span class=pill>%s</span><div class=sub>%s</div></div>"
                           % (mesh.esc(p["name"]), mesh.esc(p.get("version", "")), mesh.esc(", ".join(p.get("provides") or [])))
                           for p in peers) or "<p class=sub>Nothing else yet.</p>"))
        self.send(200, mesh.page(cfg, "Hello Weft", "The smallest complete Weft addon", body), "text/html")


mesh.heartbeat(lambda: mesh.announce(cfg, "Hello Weft", ["hello"]))
mesh.serve(cfg, Hello)
