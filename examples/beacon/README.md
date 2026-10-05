# Weft Beacon

A **provider** on the [Weft mesh](../../SPEC.md#the-mesh). It writes `~/.config/weft/mesh/beacon.json` with its address, its `/health`, `"provides": ["beacon"]` and a message, and refreshes it every 30 seconds. Nothing has to be told it exists: [Weft Pulse](../pulse) shows it, [Weft Relay](../relay) publishes it.

- Runs on both hosts (no `platforms`).
- **Linking across hosts:** install it in Selkies Forge, then add it in Aegis × Burrow. Burrow's `detect` finds it answering on port 8792, and Burrow **links** it (`ADDON_ADOPT=1`): nothing new starts, and both hosts show the same Beacon.
- Action **Show the mesh** lists every entry, fresh or stale, and whether it answers.

## Credits

Powered by the [Weft Architecture](https://github.com/alexd-aero/weft). Runs on [Selkies Forge](https://github.com/adatskov-wcpss/animated-fiesta) and [Aegis × Burrow](https://github.com/alexd-aero/aegis-burrow). MIT licensed.
