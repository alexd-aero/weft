# Weft Relay

**Burrow only** (`"platforms": ["burrow"]`): it talks to Burrow's control socket, `BURROW_SOCKET`, which only Aegis × Burrow gives its addons. Selkies Forge shows it greyed out ("made for Burrow").

Every 30 seconds it reads the [Weft mesh](../../SPEC.md#the-mesh). Every entry with a port that has no Burrow tunnel yet gets one: behind the gate's login, or public if the `ACCESS` setting says so. Relay then announces the addresses on the mesh as `routes` (`{"beacon": "https://…"}`), and [Weft Pulse](../pulse) shows them next to each addon.

- It remembers what it published in `data/routes.json`, and **uninstall takes down exactly those tunnels**, nothing else.
- Each call names it on Burrow's socket (`X-Burrow-Client: weft-relay/1.0.0`), so Burrow's Selkies Forge tab lists what it did.
- Action **Publish the mesh now** syncs at once.

## Credits

Powered by the [Weft Architecture](https://github.com/alexd-aero/weft). Runs on [Selkies Forge](https://github.com/adatskov-wcpss/animated-fiesta) and [Aegis × Burrow](https://github.com/alexd-aero/aegis-burrow). MIT licensed.
