# Weft Pulse

A **consumer** of the [Weft mesh](../../SPEC.md#the-mesh): a live board of every addon that announced itself, whether its `/health` answers, what it provides, and what other addons added to its entry:

- the desktops [Weft Shelf](../shelf) lists (`items`);
- the public addresses [Weft Relay](../relay) made (`routes`).

It also declares `"integration": {"dir": "~/.config/weft/integrations"}`, so **its host registers itself with it**. Selkies Forge writes `selkies-forge.json` there, and Pulse shows "registered with it: Selkies Forge 1.10.9".

`/api/mesh` returns the same board as JSON. Runs on both hosts.

## Credits

Powered by the [Weft Architecture](https://github.com/alexd-aero/weft). Runs on [Selkies Forge](https://github.com/adatskov-wcpss/animated-fiesta) and [Aegis × Burrow](https://github.com/alexd-aero/aegis-burrow). MIT licensed.
