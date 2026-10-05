# Hello Weft

The smallest **complete** Weft addon, and the folder to copy when you start a new one. It runs on both Weft hosts.

| Piece | File | What it shows |
|---|---|---|
| Manifest | `forge-addon.json` | every lifecycle script, two settings (`PORT`, `GREETING`), one action, links. No `platforms`, so it runs on both hosts |
| Detect | `weft/detect.sh` | read-only, quick: is a Hello Weft already answering on its port? Then a host **links** it instead of starting a second one |
| Install / update | `weft/install.sh` | `::phase`, `::progress`, `::warn`, `::open`; writes `data/config.json`, runs `app/server.py` as a systemd user service (or a background process) |
| Status | `weft/status.sh` | the one JSON line: `state`, `url`, `port` (so a host can give it a tunnel), `version`, `detail` |
| Uninstall | `weft/uninstall.sh` | removes the service; leaves a linked copy to the host that runs it |
| Action | `weft/restart.sh` | an extra button in the host's menu |
| App | `app/server.py` | a page, `/health` (`{"app": "hello-weft"}`), and an entry on the [Weft mesh](../../SPEC.md#the-mesh) |
| Vendored | `weft/lib.sh`, `weft/mesh.py` | identical copies of `tools/lib.sh` and `tools/mesh.py`. Never edit them here |

**Add it:** `https://github.com/alexd-aero/weft/tree/main/examples/hello-weft` on the Addons page of either host. **Try it without a host:** `node tools/weft-run.mjs examples/hello-weft install`.

## Credits

Powered by the [Weft Architecture](https://github.com/alexd-aero/weft). Runs on [Selkies Forge](https://github.com/adatskov-wcpss/animated-fiesta) and [Aegis × Burrow](https://github.com/alexd-aero/aegis-burrow). MIT licensed.
