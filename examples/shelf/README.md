# Weft Shelf

**Selkies Forge only** (`"platforms": ["selkies-forge"]`): it reads the Forge's API (`FORGE_API`, which the Forge gives its addons and `weft/lib.sh` stores in `data/config.json`). Aegis × Burrow shows it greyed out ("made for Selkies Forge").

Every 30 seconds it reads the Forge's desktops (`GET instances`) and announces them on the [Weft mesh](../../SPEC.md#the-mesh) as the `items` of its entry. [Weft Pulse](../pulse) lists them under it, and so can anything else that reads the mesh, on either host. Its own page lists them with their links.

## Credits

Powered by the [Weft Architecture](https://github.com/alexd-aero/weft). Runs on [Selkies Forge](https://github.com/adatskov-wcpss/animated-fiesta) and [Aegis × Burrow](https://github.com/alexd-aero/aegis-burrow). MIT licensed.
