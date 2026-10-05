"""Weft Beacon: announces a message on the Weft mesh, refreshed every 30 s."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "weft"))
import mesh  # noqa: E402  (weft/mesh.py, vendored)

cfg = mesh.load_config(sys.argv[1])


class Beacon(mesh.Handler):
    ROUTES = {"/": "home", "/message": "message"}

    def message(self):
        self.send(200, {"message": cfg.get("message", "")})

    def home(self):
        body = ("<div class=card><span class='pill ok'><span class='dot ok'></span>announcing</span>"
                "<p style='font-size:22px;margin:12px 0 0'>&ldquo;%s&rdquo;</p></div>"
                "<p class=sub>Its entry: <span class=mono>%s/%s.json</span>. Weft Pulse shows it; so can anything that reads the mesh.</p>"
                % (mesh.esc(cfg.get("message", "")), mesh.esc(mesh.mesh_dir(cfg)), mesh.esc(cfg["id"])))
        self.send(200, mesh.page(cfg, "Weft Beacon", "A provider on the Weft mesh", body), "text/html")


mesh.heartbeat(lambda: mesh.announce(cfg, "Weft Beacon", ["beacon"], message=cfg.get("message", "")))
mesh.serve(cfg, Beacon)
