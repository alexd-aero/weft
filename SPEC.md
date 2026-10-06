# The Weft Architecture, spec 1

This is the normative definition of a Weft addon and of what a Weft host does with one. **MUST**, **MUST NOT**, **SHOULD** and **MAY** mean what RFC 2119 says. When this page and a host disagree, this page wins and the host has a bug.

Weft hosts today: **[Selkies Forge](https://github.com/adatskov-wcpss/animated-fiesta)** (1.10.8+, `ADDON_HOST=selkies-forge`) and **[Aegis × Burrow](https://github.com/alexd-aero/aegis-burrow)** (2.0.0+, `ADDON_HOST=burrow`). Both read the same manifest with the same rules (Selkies Forge's `src/forge/addons.py`, Burrow's `burrow/addons.mjs`; `tools/weft-check.mjs` carries a copy of those rules).

- [1. The addon](#1-the-addon)
- [2. forge-addon.json](#2-forge-addonjson)
- [3. Sources](#3-sources)
- [4. Scripts](#4-scripts)
- [5. The environment](#5-the-environment)
- [6. Talking back](#6-talking-back)
- [7. Linking](#7-linking)
- [8. The mesh](#the-mesh)
- [9. Integrations](#9-integrations)
- [10. Host APIs](#10-host-apis)
- [11. Rules every host enforces](#11-rules-every-host-enforces)

## 1. The addon

An addon is **one folder** with a file named `forge-addon.json` at its root, plus whatever that file points to. The file keeps its historical name on every host.

- Everything an addon uses MUST be inside its folder. Paths in the manifest are relative, MUST NOT start with `/`, and MUST NOT contain `..`. A host refuses any path that resolves outside the folder, symlinks included.
- The folder is **replaced on every update**. An addon MUST keep its state in `ADDON_DATA`, never in its own folder.
- Scripts MUST be bash. Apps MAY be in any language.

## 2. forge-addon.json

| Field | Required | Type and limits | Meaning |
|---|---|---|---|
| `spec` | **yes** | `1` | This spec. A host refuses a spec it doesn't know |
| `id` | **yes** | `^[a-z0-9][a-z0-9-]{1,39}$` | Identity: folder name, URL, CLI name. MUST NOT change once published |
| `name` | **yes** | text ≤ 60 | Shown on the card |
| `version` | **yes** | text ≤ 30 | Semantic version (`1.4.2`) |
| `description` | no | text ≤ 600 | One or two sentences |
| `author` | no | text ≤ 80 | |
| `homepage` | no | http(s) URL | |
| `license` | no | text ≤ 40 | |
| `logo` | no | path to .svg .png .webp .jpg, ≤ 512 KB | Square, with its own background |
| `platforms` | no | non-empty list of `"selkies-forge"`, `"burrow"` | The hosts it is made for. **Omitted means every host.** A host shows an addon made for another one but MUST NOT install it |
| `replaces` | no | list ≤ 8 of ids | Addons this one supersedes. Scans hide copies of those |
| `requires` | no | object | See below |
| `scripts` | **yes** | object | `install` is required; `detect`, `update`, `uninstall`, `status` are optional. Any other key is an error |
| `actions` | no | list ≤ 8 of `{id, label ≤ 24, script, confirm? ≤ 200}` | `id` matches `^[a-z][a-z0-9-]{0,23}$` and MUST NOT be a script name |
| `settings` | no | list ≤ 16 | See below |
| `integration` | no | `{"dir": "~/…"}` | A folder under `~/` where the host drops a file describing itself. See [9](#9-integrations) |
| `links` | no | list ≤ 6 of `{label ≤ 40, url}` | |
| `burrow` | no | `{"extension"?: path, "ui"?: path}` | Burrow only (2.8.0+), ignored elsewhere. See [10](#10-host-apis) |

Unknown top-level fields are ignored. Newer manifests still load in older hosts.

**`requires`** has these keys:

| Key | Meaning |
|---|---|
| `forge` | The oldest Selkies Forge it works with, e.g. `">=1.10.0"`. Only Selkies Forge checks it |
| `burrow` | The oldest Aegis × Burrow it works with, e.g. `">=2.0.0"`. Only Burrow checks it |
| `os` | Lowercase system names, e.g. `["linux"]` |
| `arch` | `uname -m` names: `x86_64`, `aarch64`, `armv7l`. `amd64`, `x64`, `arm64` and `armhf` are understood too |
| `commands` | Programs that MUST be on `PATH` |

An addon SHOULD set `forge` exactly when it runs on Selkies Forge, and `burrow` exactly when it runs on Burrow.

**Settings:** `{key, label ≤ 60, type, default?, help? ≤ 300, required?, min?, max?, options?, icon?}`.

- `key` matches `^[A-Z][A-Z0-9_]{0,31}$`.
- `type` is one of `text`, `number`, `bool`, `select`, `password`.
- A `select` MUST have `options`.
- A host shows a password setting back as `••••••••`. Sending that mask back keeps the stored value.

## 3. Sources

A host MUST accept all of these:

| Kind | Examples |
|---|---|
| git | `https://github.com/OWNER/REPO`; `…/tree/REF/a/folder`; `…/blob/REF/a/folder/forge-addon.json`; GitLab `https://gitlab.com/GROUP/SUB/REPO/-/tree/REF/a/folder` (subgroups and self-hosted GitLab too); Codeberg; any git URL with `#a/folder`; `git@host:o/r.git` |
| archive | `https://…/x.zip`, `.tar.gz` or `.tgz`, optionally with `#a/folder`. Includes GitHub's `/archive/refs/heads/main.zip` and GitLab's `/-/archive/…` |
| local | `/a/folder/on/this/machine` (development) |

Archives are **inspected statically**: downloaded (≤ 200 MB) and unpacked (≤ 500 MB, ≤ 20 000 files) into a fresh folder. A host MUST refuse the whole archive when any entry has an absolute path, `..` or a drive letter. It MUST NOT unpack links. A single top-level folder is dropped. The manifest is then validated, and nothing in the archive runs before that. An archive's "commit" is `sha256:<hex>` of the download. An update check downloads it again and compares.

Both hosts can *inspect* any source without adding it or running anything: `POST /api/addons/inspect` on Selkies Forge, `POST /__gate/api/addons/inspect` on Burrow, `selkies-cli addon inspect LINK`.

## 4. Scripts

A host runs a script as `bash <script>`, from the addon's folder, as the host's user, in a new process group, with stdin closed. stdout and stderr are read line by line.

| Script | When | Contract | Timeout |
|---|---|---|---|
| `detect` | on add, on install, during scans | **Read-only and quick.** Exit 0 with one JSON line `{"version","url","detail"}` when the app is already on this machine; otherwise exit non-zero | 20 s |
| `install` | Install / Link | Exit 0 on success. MUST be idempotent: it runs again on reinstall | 60 min |
| `update` | Update, after the new code is in place (falls back to `install`) | `ADDON_UPDATE=1`. Keep the user's data and settings | 60 min |
| `uninstall` | Uninstall | Stop and remove what install created. `ADDON_KEEP_DATA=0` means the user asked to delete the data; the host deletes `ADDON_DATA` itself | 15 min |
| `status` | Every few seconds while a page shows it | **Read-only and quick.** The last line is one JSON object: `{"state": "running"\|"stopped"\|"error"\|"installed", "url"?, "port"?, "version"?, "detail"?, "name"?}` | 15 s |
| actions | when pressed | Exit 0 on success | 15 min |

- `status.port` lets a host give the app other ways in, such as a Burrow tunnel or a serveo link.
- `status.name` overrides the card's name while the addon is installed.
- During a scan, `ADDON_SCAN=1` is set and `ADDON_DATA` is a scratch folder that is deleted afterwards.

A script that needs a password prompt hangs until its timeout. Scripts run unattended: no `sudo` that asks, and no `read`.

## 5. The environment

Every host sets these, and passes the rest of its own environment through:

| Variable | Meaning |
|---|---|
| `ADDON_SPEC` | `1` |
| `ADDON_ID`, `ADDON_NAME`, `ADDON_VERSION` | From the manifest being run |
| `ADDON_DIR` | The addon's folder (the working directory). Replaced on update |
| `ADDON_DATA` | The addon's own folder, kept across updates and reinstalls |
| `ADDON_SETTING_<KEY>` | Each setting. Booleans are `1` or `0` |
| `ADDON_ADOPT` | `1` when `detect` found the app and the host is linking it, and during updates |
| `ADDON_UPDATE` | `1` during an update |
| `ADDON_KEEP_DATA` | `uninstall` only: `0` when the data is to be deleted |
| `ADDON_HOST` | `selkies-forge` or `burrow` |
| `ADDON_HOST_VERSION`, `ADDON_HOST_URL` | The host's version and dashboard |
| `ADDON_BIND` | The address the host listens on. Listen on the same one |
| `ADDON_SCAN` | `1` while a scan probes `detect` and `status` |

- **Twins.** Every `ADDON_X` above (except `ADDON_HOST*`) is also set as `FORGE_ADDON_X`, for scripts written before spec 1 had universal names. New scripts SHOULD read `ADDON_*`.
- **Selkies Forge** adds `FORGE_URL`, `FORGE_API`, `FORGE_HOME`, `FORGE_VERSION`, `FORGE_BIND`, `FORGE_PORT` and `FORGE_ARCH`.
- **Burrow** adds `BURROW_SOCKET` (2.8.0+: the short path when the data folder is deep, so curl takes it) and `BURROW_NODE` (the Node.js Burrow runs on). When a Selkies Forge has registered with it, Burrow also adds `FORGE_URL`, `FORGE_API` and `FORGE_HOME`.

## 6. Talking back

A line on stdout that starts with `::` is a directive, not log output:

| Line | Effect |
|---|---|
| `::progress N text` | Progress bar to N % (0–100), labelled `text` |
| `::phase text` | Names the current step |
| `::open URL` | What the host's **Open** button opens from now on (http/https only) |
| `::warn text` | A warning shown after the job |

Hosts ignore unknown directives. Everything else is shown in the live log.

## 7. Linking

When `detect` finds the app already on this machine, a host offers **Link it** instead of Install, and runs `install` with `ADDON_ADOPT=1`. The install script MUST then take over the running copy without starting a second one. Typically it records where that copy is and starts nothing.

This is how one app becomes an addon of two hosts at once. It is also how Aegis × Burrow and Selkies Forge become each other's addon. A linked copy's `uninstall` MUST leave the app running for the host that owns it.

The examples do this in `weft/install.sh`: they write `"linked": true` to `data/config.json`, and `status`, `restart` and `uninstall` respect it.

<a id="the-mesh"></a>
## 8. The mesh

The mesh is how addons find each other without being told. It is a folder, `~/.config/weft/mesh` (or `$MESH`), with **one JSON file per running addon, named `<id>.json`, written by that addon**:

```json
{
  "spec": 1, "id": "beacon", "name": "Weft Beacon", "version": "1.0.0", "host": "burrow",
  "url": "http://127.0.0.1:8792/", "health": "http://127.0.0.1:8792/health", "port": 8792,
  "provides": ["beacon"], "items": [], "routes": {}, "updated": 1760000000
}
```

| Key | Meaning |
|---|---|
| `provides` | What it offers, as short words (`dashboard`, `desktops`, `routes`, …) |
| `items` | Things it lists for others, e.g. Weft Shelf's desktops: `{name, title, running, url}` |
| `routes` | Public addresses it made for others, keyed by id (Weft Relay) |
| `updated` | Unix time. The addon MUST refresh its entry at least every 30 s |

- An entry older than 90 s is **stale**: its addon stopped without saying so.
- An addon MUST remove its own entry when it stops cleanly.
- An addon MUST NOT write any entry but its own. It MAY read every entry.
- Entries are written atomically: write a temporary file, then rename it.
- `weft/mesh.py` does all of this (`announce`, `withdraw`, `peers`, `heartbeat`).
- `/health` MUST answer `{"app": "<id>", "ok": true, "version": "…"}`. Weft scripts recognise their own app by `app`, and never take a port another app holds.

## 9. Integrations

With `"integration": {"dir": "~/.config/myapp/integrations"}`, a host keeps one file there describing itself while the addon is installed. The host expands `~` with `HOME`.

- **Selkies Forge** writes `selkies-forge.json`: `{spec, id, kind, name, version, url, api, port, public_url, logo, home, addon, updated}`, mode `644`. The file is rewritten when something changes and refreshed hourly. `addon` says how the Forge runs *this* addon: version, commit, update state, and a `#addons/<id>` link.
- **Aegis × Burrow** reads `~/.config/aegis/integrations/*.json` from any app. That is how it shows Selkies Forge's desktops.

## 10. Host APIs

**Burrow extensions.** An addon installed on Burrow 2.8.0+ whose manifest has `"burrow": {"extension": "x.mjs"}` runs that ES module inside Burrow while it is installed (its scripts already run as the same user, so this grants nothing new). Burrow calls `start(ctx)` when it is installed or updated and `stop()` before it goes; `ctx` has `dataDir`, `setting(KEY)`, `domain()`, `dns()` (the linked zone's records, read-only), `log()` and `tunnels` (`list`, and `create`, `update`, `remove` for the tunnels this addon made, which carry `app: <id>`). `handle({method, path, query, json(), unseal(), via})` answers `/__gate/api/x/<id>/…` on the dashboard (signed in) and `/x/<id>/…` on the control socket, with `{status, json}` or `{status, body, type}`. `"ui": "y.js"` is an ES module the Burrow page imports: `card(ctx)` returns the HTML of the addon's card, `wire(el, ctx)` runs after each paint. [Burrow Pages](https://github.com/alexd-aero/burrow-pages) is the reference.

| Host | API | Who may call it |
|---|---|---|
| Selkies Forge | HTTP at `FORGE_API` (`instances`, `instance/NAME/start\|stop\|restart`, `addons`, …; see its [API docs](https://github.com/adatskov-wcpss/animated-fiesta/blob/main/docs/api.md)) | Anything on this machine. JSON bodies, no foreign `Origin` |
| Aegis × Burrow | Plain HTTP on the Unix socket `BURROW_SOCKET` (mode 600): `GET /status`, `GET\|POST /tunnels`, `GET\|PATCH\|DELETE /tunnels/PORT`, `POST /module`, `GET /dns` (the linked domain's DNS records, read-only), `/x/<id>/…` (an extension's routes) | The same user. Callers SHOULD send `X-Burrow-Client: <id>/<version>` |

An addon that needs a host API MUST say so with `platforms`.

## 11. Rules every host enforces

A host refuses an addon, with a message saying exactly what to fix, when:

- the manifest isn't valid JSON, isn't an object, or is larger than 64 KB;
- `spec` isn't `1`, or `id` doesn't match its pattern;
- a required field is missing, or a text field is too long;
- a path is absolute, contains `..`, or resolves outside the folder;
- a script it names doesn't exist, or a script name is unknown;
- an image isn't .svg/.png/.webp/.jpg, or is over 512 KB;
- `platforms` has an unknown host, or `requires.forge`/`requires.burrow` doesn't look like `>=1.2.3`;
- there are more than 8 actions or 16 settings, a setting key is duplicated, or a `select` has no options;
- `integration.dir` isn't under `~/`;
- an archive breaks any rule in [3](#3-sources).

It won't **install** an addon made for another platform, or one this machine fails (`requires`), and it says why on the card.

---

<sub>The Weft Architecture · MIT · the format behind every addon on [Selkies Forge](https://github.com/adatskov-wcpss/animated-fiesta) and [Aegis × Burrow](https://github.com/alexd-aero/aegis-burrow).</sub>
