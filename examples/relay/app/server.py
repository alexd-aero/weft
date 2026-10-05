"""Weft Relay: every web addon on the Weft mesh gets a Burrow address.

Every 30 s it reads the mesh and, through Burrow's control socket
(BURROW_SOCKET, given to install by Aegis × Burrow), publishes each entry
that has a port and isn't published yet. It announces the addresses back on
the mesh as "routes" ({id: url}), which Weft Pulse shows. It remembers what it
published in data/routes.json, so uninstall takes exactly those down again."""
import http.client
import json
import socket
import threading

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "weft"))
import mesh  # noqa: E402  (weft/mesh.py, vendored)

cfg = mesh.load_config(sys.argv[1])
ROUTES_FILE = os.path.join(os.path.dirname(sys.argv[1]), "routes.json")
STATE = {"routes": {}, "error": None}


class _Unix(http.client.HTTPConnection):
    def __init__(self, path):
        http.client.HTTPConnection.__init__(self, "burrow", timeout=60)
        self.path_ = os.path.realpath(path)        # a deep data folder links to a short socket path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.path_)


def burrow(method, path, body=None):
    c = _Unix(cfg.get("burrow_socket") or "")
    try:
        c.request(method, path, body=json.dumps(body) if body is not None else None,
                  headers={"Content-Type": "application/json", "X-Burrow-Client": "weft-relay/" + cfg.get("version", "")})
        r = c.getresponse()
        out = json.loads(r.read() or b"{}")
        if r.status >= 400:
            raise RuntimeError(out.get("error") or "Burrow answered HTTP %d" % r.status)
        return out
    finally:
        c.close()


def load_mine():
    try:
        with open(ROUTES_FILE) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def sync():
    if not cfg.get("burrow_socket"):
        raise RuntimeError("no BURROW_SOCKET: Weft Relay runs in Aegis × Burrow only")
    tunnels = {t["targetPort"]: t for t in burrow("GET", "/tunnels").get("tunnels") or []}
    mine, routes = load_mine(), {}
    for p in mesh.peers(cfg):
        if p["id"] == cfg["id"] or not p.get("port"):
            continue
        t = tunnels.get(p["port"])
        if not t:
            host = (p.get("url") or "").split("//")[-1].split(":")[0].strip("[]") or "127.0.0.1"
            t = burrow("POST", "/tunnels", {"port": p["port"], "targetPort": p["port"], "targetHost": host,
                                            "name": p.get("name") or p["id"], "access": cfg.get("access") or "login"})
            mine[p["id"]] = p["port"]
            print("published", p["id"], "on port", p["port"], flush=True)
        if t.get("url"):
            routes[p["id"]] = t["url"]
    mesh.write_json(ROUTES_FILE, mine)
    STATE.update(routes=routes, error=None)
    mesh.announce(cfg, "Weft Relay", ["routes"], routes=routes)
    if any(aid not in routes for aid in mine):
        threading.Timer(6, beat).start()        # a new quick tunnel gets its name a few seconds later


def beat():
    try:
        sync()
    except Exception as ex:
        STATE["error"] = str(ex)
        mesh.announce(cfg, "Weft Relay", ["routes"], routes=STATE["routes"], error=str(ex))
        raise


class Relay(mesh.Handler):
    ROUTES = {"/": "home", "/api/routes": "api"}

    def api(self):
        self.send(200, STATE)

    def home(self):
        rows = "".join("<div class=card><b>%s</b><div class=mono><a href='%s'>%s</a></div></div>" % (mesh.esc(k), mesh.esc(v), mesh.esc(v))
                       for k, v in sorted(STATE["routes"].items()))
        err = "<div class=card><span class='pill err'>error</span> %s</div>" % mesh.esc(STATE["error"]) if STATE["error"] else ""
        self.send(200, mesh.page(cfg, "Weft Relay", "Burrow addresses for the Weft mesh (%s)" % ("login" if cfg.get("access") != "public" else "public"),
                                 err + "<div class=grid>%s</div>" % (rows or "<p class=sub>Nothing to publish yet.</p>"), refresh=15), "text/html")


mesh.heartbeat(beat)
mesh.serve(cfg, Relay)
