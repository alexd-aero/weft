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
- [12. Themes](#12-themes)

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
| `actions` | no | list ≤ 8 of `{id, label ≤ 24, script, confirm? ≤ 200, root? bool}` | `id` matches `^[a-z][a-z0-9-]{0,23}$` and MUST NOT be a script name. `"root": true`: the action needs root (see [4](#root)) |
| `settings` | no | list ≤ 16 | See below |
| `integration` | no | `{"dir": "~/…"}` | A folder under `~/` where the host drops a file describing itself. See [9](#9-integrations) |
| `links` | no | list ≤ 6 of `{label ≤ 40, url}` | |
| `burrow` | no | `{"extension"?: path, "ui"?: path}` | Burrow only (2.8.0+), ignored elsewhere. See [10](#10-host-apis) |
| `update_card` | no | object | How hosts dress this addon's update card: colours, style, badge, icon, words, highlights, urgency. See [2.1](#21-update-cards) |

Unknown top-level fields are ignored. Newer manifests still load in older hosts.

**`requires`** has these keys:

| Key | Meaning |
|---|---|
| `forge` | The oldest Selkies Forge it works with, e.g. `">=1.10.0"`. Only Selkies Forge checks it |
| `burrow` | The oldest Aegis × Burrow it works with, e.g. `">=2.0.0"`. Only Burrow checks it |
| `os` | Lowercase system names, e.g. `["linux"]` |
| `arch` | `uname -m` names: `x86_64`, `aarch64`, `armv7l`. `amd64`, `x64`, `arm64` and `armhf` are understood too |
| `commands` | Programs that MUST be on `PATH` |
| `root` | Text ≤ 200: **why** the addon needs root, shown to the user before it runs, e.g. `"Installs and configures Postfix and OpenDKIM"`. When present, `install`, `update` and `uninstall` need root. See [4](#root) |

An addon SHOULD set `forge` exactly when it runs on Selkies Forge, and `burrow` exactly when it runs on Burrow.

**Settings:** `{key, label ≤ 60, type, default?, help? ≤ 300, required?, min?, max?, options?, icon?}`.

- `key` matches `^[A-Z][A-Z0-9_]{0,31}$`.
- `type` is one of `text`, `number`, `bool`, `select`, `password`.
- A `select` MUST have `options`.
- A host shows a password setting back as `••••••••`. Sending that mask back keeps the stored value.

### 2.1 Update cards

When a host finds a newer version of an installed addon, it shows an update card (Aegis × Burrow: on the home page and above the addon's section on the Burrow page). `update_card` lets each release dress its own card. The host reads it from the **new** version's manifest, so a release can say what it brings; without one, the host's default card is shown. Every key is optional:

| Key | Type and limits | Meaning |
|---|---|---|
| `theme` | `green` (default), `blue`, `red`, `orange`, `amber`, `purple`, `pink`, `teal`, `gray` | The card's colour |
| `accent` | `"#rrggbb"` | A colour of your own. Wins over `theme`; the host derives the lighter and darker shades and the text colour on it |
| `style` | `glow` (default), `solid`, `outline`, `minimal` | How loud the card is: a glowing gradient, a filled card, a coloured outline, or a slim bar |
| `urgency` | `normal` (default), `recommended`, `important`, `security`, `critical` | `security` and `critical` default to `red`, a shield and a line asking to install soon; `important` to `orange`; `recommended` to a RECOMMENDED badge. Your own `theme`, `badge` and `icon` still win |
| `badge` | text ≤ 14 | The chip beside the title (default `NEW`; `""` for none) |
| `icon` | `download` (default), `shield`, `bolt`, `spark`, `heart`, `star`, `wrench`, `rocket`, `lock`, `bug` | The icon in the card's orb |
| `title` | text ≤ 80 | Replaces "‹name› update". `{name}`, `{version}` (the new one) and `{from}` (the installed one) are filled in |
| `tagline` | text ≤ 140 | One line under the title |
| `highlights` | list ≤ 5 of text ≤ 100 | What's new, shown as bullets |
| `button` | text ≤ 24 | The update button's words, e.g. `"Update to {version}"` |
| `notes` | http(s) URL | Release notes: a "Release notes" button opens it |

Any other key is an error; `weft-check` names it. Example:

```json
"update_card": {
  "urgency": "security",
  "title": "{name} {version}: a security fix",
  "tagline": "Closes a gap in the payload check.",
  "highlights": ["Blocks a new phishing-kit scan", "Bans repeat offenders faster"],
  "notes": "https://github.com/you/your-addon/releases"
}
```

Hosts:

- MUST treat every text in it as plain text (escaped, never HTML) and MAY shorten it to fit.
- MUST NOT let a missing, unreadable or invalid `update_card` in a new version hold the update back: that version simply gets the default card. An invalid `update_card` in an installed manifest is refused like any other field.
- SHOULD keep the card's controls (update, later, what's new) the same whatever the dressing, and keep text readable on the chosen colour.
- MAY ignore `update_card` (Selkies Forge does today); the card then looks like the host's own.

`node tools/weft-card.mjs <folder>` writes a preview of the card as an HTML page, every style side by side.

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

A script that needs a password prompt hangs until its timeout. Scripts run unattended: no `sudo` that asks, and no `read`. An addon that needs root says so instead:

<a id="root"></a>
### Root

`"requires": {"root": "why"}` means `install`, `update` and `uninstall` need root; an action with `"root": true` does too. A host that supports it (Aegis × Burrow 2.33.0+):

- MUST NOT start such a script before the user agreed. It first checks `sudo -k -n true`. With passwordless sudo it shows a warning, *"‹name› needs administrator (root) access: ‹why›. Continue?"*; otherwise it asks for the user's password and checks it with `sudo -S -k -p '' -v` (on stdin, never in argv or the environment). A wrong password runs nothing. When this user can't use sudo at all, it says so and points to a terminal.
- MUST keep the password in memory only, under a random token for that one job, gone when the job ends (an hour at most): never on disk, in logs, in the job's output, in settings or in an environment.
- runs the script with `ADDON_ROOT=1`, `ADDON_ASKPASS_TOKEN` and `SUDO_ASKPASS` (a helper it ships; see [5](#5-the-environment)). The script calls **`sudo -A …`**: sudo runs the helper, which fetches the password from the host, so it never prompts on a terminal. With passwordless sudo the helper is never needed, and `sudo -A` works the same.
- MUST NOT run a root script on its own: automatic installs, update checks, the watchdog and "start it" repairs skip it and leave a notice instead.
- reads `update` from the **new** version's manifest: a new version that starts needing root is asked for before its code replaces the old.

**In the user's terminal.** A host MAY run a root script in the user's own terminal instead, for example when it can't get root itself (a sandboxed service: `NoNewPrivileges=`, `ProtectSystem=`, no sudo). Aegis × Burrow 2.35.0+ does this for `aegis addons install|update|uninstall ID` and `aegis addons action ID ACTION` (automatically when it can't get root, or with `--here`); its dashboard then shows that command to copy. The host still makes and owns the job: it hands the script step over once, on its control socket only, the terminal runs `bash <script>` from `ADDON_DIR` with the same `ADDON_*` variables and `ADDON_ROOT=1`, streams the lines back (directives work as always) and reports the exit code, and the host finishes the job as if it had run it. An update's new version is staged first and only stays if that run succeeds. In that case:

- stdin is the terminal (a TTY), and `SUDO_ASKPASS` and `ADDON_ASKPASS_TOKEN` are **not** set: a plain `sudo` asks for the password right there.
- So a script SHOULD call `sudo -A …` when `SUDO_ASKPASS` is set and plain `sudo …` otherwise, e.g. `if [ -n "${SUDO_ASKPASS:-}" ]; then SUDO=(sudo -A); else SUDO=(sudo); fi; "${SUDO[@]}" systemctl restart postfix`.
- Never `read` from stdin for anything else: the same script also runs with stdin closed.

For the script:

- `sudo` resets the environment: pass what the root side needs, e.g. `sudo -A env ADDON_DATA="$ADDON_DATA" bash "$ADDON_DIR/weft/root-part.sh"`, or `sudo -A install -m 644 …` one command at a time.
- Pick the sudo for where it runs: `sudo -A` with `SUDO_ASKPASS` (the host hands the password over), plain `sudo` without it (the user's terminal asks).
- Check `ADDON_ROOT` first. A host without root support (Selkies Forge, Burrow before 2.33.0) ignores `requires.root` and the action's `root`, so the manifest still loads, but the script then runs without `SUDO_ASKPASS` and `sudo -A` stops at once ("no askpass program specified") instead of hanging. Say why and exit: `[ "${ADDON_ROOT:-0}" = 1 ] || sudo -n true 2>/dev/null || { echo "::warn this needs root: install it from Aegis × Burrow 2.33+ (it asks), or run sudo bash install.sh"; exit 1; }`. An addon that needs root SHOULD also set `"requires": {"burrow": ">=2.33.0"}`.
- `detect` and `status` never get root: keep them read-only.

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
| `ADDON_ROOT` | `1` when the user gave this job root ([4](#root)), else `0` |
| `ADDON_ASKPASS_TOKEN` | Root jobs run by the host only: what the askpass helper hands the host. Valid while this job runs |
| `SUDO_ASKPASS` | Root jobs run by the host only: the host's askpass helper, an absolute path. Use `sudo -A`. Unset when the script runs in the user's terminal: use plain `sudo` |

- **Twins.** Every `ADDON_X` above (except `ADDON_HOST*`, `ADDON_ROOT` and `ADDON_ASKPASS_TOKEN`) is also set as `FORGE_ADDON_X`, for scripts written before spec 1 had universal names. New scripts SHOULD read `ADDON_*`.
- A host MUST NOT pass `ADDON_ROOT`, `ADDON_ASKPASS_TOKEN` or `SUDO_ASKPASS` through from its own environment: only a root job gets them.
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

**Burrow extensions.** An addon installed on Burrow 2.8.0+ whose manifest has `"burrow": {"extension": "x.mjs"}` runs that ES module inside Burrow while it is installed (its scripts already run as the same user, so this grants nothing new). Burrow calls `start(ctx)` when it is installed or updated and `stop()` before it goes; `ctx` has `dataDir`, `setting(KEY)`, `domain()`, `dns()` (the linked zone's records, read-only), `log()` and `tunnels` (`list`, and `create`, `update`, `remove` for the tunnels this addon made, which carry `app: <id>`; on 2.29+ `create`/`update` take `lockFrom: PORT` to hand another tunnel's password over, hash only, also from a tunnel removed in the last 15 minutes). On 2.31+, `ctx.fleet` reaches the user's other machines (the Machines tab): `enabled()`, `list()` (`{id, name, address, os, arch, up, standby, via}`), `forward(machine, port)` makes that machine's own `127.0.0.1:port` answer on a port of the host (`{host: "127.0.0.1", port, state}`: an SSH local forward over the link the Machines tab already has, straight or through the machine's agent, kept up and restarted until released), `release(machine, port)`, and `forwards()`; an addon's forwards are released when it is unloaded. A tunnel or site pointed at the forward's port publishes a service of another machine. `handle({method, path, query, json(), unseal(), via})` answers `/__gate/api/x/<id>/…` on the dashboard (signed in) and `/x/<id>/…` on the control socket, with `{status, json}` or `{status, body, type}`. `"ui": "y.js"` is an ES module the Burrow page imports: `card(ctx)` returns the HTML of the addon's card, `wire(el, ctx)` runs after each paint. [Burrow Pages](https://github.com/alexd-aero/burrow-pages) is the reference.

| Host | API | Who may call it |
|---|---|---|
| Selkies Forge | HTTP at `FORGE_API` (`instances`, `instance/NAME/start\|stop\|restart`, `addons`, …; see its [API docs](https://github.com/adatskov-wcpss/animated-fiesta/blob/main/docs/api.md)) | Anything on this machine. JSON bodies, no foreign `Origin` |
| Aegis × Burrow | Plain HTTP on the Unix socket `BURROW_SOCKET` (mode 600): `GET /status`, `GET\|POST /tunnels`, `GET\|PATCH\|DELETE /tunnels/PORT`, `POST /module`, `GET /dns` (the linked domain's DNS records, read-only), `/x/<id>/…` (an extension's routes); 2.29+: `GET /addons`, `GET /addons/updates`, `POST /addons/check`, `POST /addons/add {source}`, `POST /addons/<id>/install\|update\|uninstall\|action\|check\|autorestart`, `GET /addons/jobs/<job>`; 2.33+: a root operation takes `{password}` (without one, when sudo asks: `428 {needsRoot, reason, passwordless: false}`; wrong: `403 {badPassword}`; no sudo here: `403 {noSudo, why}`), `GET /addons/<id>/root` (`{needsRoot, reason, needs, sudo, passwordless, why}`), and `POST /askpass {"token"}` (the askpass helper's: the running job's password as text, else `404`; only on this socket, never on the dashboard); 2.35+: `POST /addons/<id>/runspec {op, action?, keep_data?}` (a root job's script step for the user's terminal, once: `{job, token, script, cwd, env, expires}`), `POST /addons/jobs/<job>/line {token, lines}` and `POST /addons/jobs/<job>/done {token, code}` (`403` without the job's token, `410` once it isn't waiting: cancelled, done, or two hours passed) | The same user. Callers SHOULD send `X-Burrow-Client: <id>/<version>` |

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
- `update_card` has an unknown key, a value outside its list, a text too long, or an `accent` that isn't `#rrggbb`;
- `requires.root` isn't text of 1–200 characters, or an action's `root` isn't `true` or `false` (hosts without root support ignore both);
- an archive breaks any rule in [3](#3-sources).

It won't **install** an addon made for another platform, or one this machine fails (`requires`), and it says why on the card.

---

<sub>The Weft Architecture · MIT · the format behind every addon on [Selkies Forge](https://github.com/adatskov-wcpss/animated-fiesta) and [Aegis × Burrow](https://github.com/alexd-aero/aegis-burrow).</sub>

## 12. Themes

A **theme** is a new look for a host's signed-in pages. Aegis × Burrow (2.45.0+) is the theme host today; its rules are in `aegis/themes.mjs`, and `tools/weft-theme.mjs` carries a copy of the static ones (`node tools/weft-check.mjs <theme folder>`).

### 12.1 The package

A theme is **one folder with a file named `.theme`** (JSON) in it, plus what that file points to. It arrives the way an addon does ([3](#3-sources)): an uploaded `.zip` or `.tar.gz`, a download link, or a git repository (GitHub, GitLab with subgroups, any git URL). A host MUST search what it unpacked for `.theme` files, MUST open archives it finds inside (up to three deep), and MUST let the user pick when there is more than one.

| Field | Required | Type and limits | Meaning |
|---|---|---|---|
| `weft` | **yes** | `1` | This spec |
| `kind` | **yes** | `"theme"` | |
| `api` | **yes** | `1` | The theme API (12.3). A host refuses an API it doesn't speak and says to update |
| `id` | **yes** | `^[a-z0-9][a-z0-9-]{1,39}$` | MUST NOT change once published |
| `name`, `version` | **yes** | text ≤ 60; `1.2.3` | |
| `previews` | **yes** | 1–8 of `"path"` or `{file, caption ≤ 60}`, .png .jpg .webp .gif .avif, ≤ 5 MB each | Pictures of the theme in use. **A theme without previews MUST be refused**: the user confirms on them |
| `root` | no | a folder in the package | Where its files are (default: next to `.theme`) |
| `description` ≤ 600, `author` ≤ 80, `license` ≤ 40, `homepage` | no | | |
| `accent` | no | `#rrggbb` | Its color, for cards and the welcome |
| `requires.burrow` | no | a range: `">=2.45.0"`, `">=2.45.0 <3"` | |
| `backgrounds` | no | `{builtin, default, recommended}` | 12.6 |
| `onboarding` | no | ≤ 8 of `{title ≤ 60, body ≤ 600, image?, button?: {label ≤ 24, href}}` | Its welcome steps, after the host's own. `href` is a path in the dashboard (`/__gate/…`, `/`) or https |

### 12.2 What a theme may change

Under `root`:

- **`theme.css`**: styles **layered on top of** the host's (loaded after `ui.css` on every signed-in page). The easy and durable kind of theme: CSS variables and a few rules, and it keeps working as the host updates. Example: [`examples/themes/midnight`](examples/themes/midnight).
- **Replacements**, same names as the host's own files: `ui.css`, `home.html`, `tunnels.html`, `settings.html`, `welcome.html`, `common.js`, `home.js`, `tunnels.js`, `settings.js`, `welcome.js`, `fleet.js`, `distros.js`, `themes.js`, `logos/*.svg|png|webp`. A replaced page runs the theme's code in the user's signed-in dashboard; it is tied to the host version it was made from (12.4 says which).
- **`assets/**`**: its own files (pictures, fonts, video), served under `/__gate/theme/assets/…`.

A host MUST NOT let a theme replace a page or script that sees a password being typed: the sign-in, setup and unlock pages and their scripts (`login.html`, `login.js`, `login.css`, `setup.html`, `unlock.html`). It MUST serve a theme's files only to a signed-in browser (a theme can be private), MUST serve its SVGs sandboxed, and MUST keep the core host script (12.5) in every page whatever the theme.

### 12.3 What happens when one is added

1. **Staged.** Unpacked into a scratch folder; nothing in it runs and nothing changes.
2. **Report.** The manifest; which files it changes; every script parsed as a module (a script that doesn't parse is refused); the **safety scan** (below); the `.stability` check (12.4).
3. **Preview.** Its pages, live, in frames on the user's own dashboard (`/__gate/theme-preview/<token>/page/home`), the rest of the dashboard unchanged. The core host script in each frame reports how the page did (drew something, errors, time): the **live stability run**.
4. **Confirm.** The user looks at the previews and the live run and says so. Then it applies; the version before is kept (one click back), and so is the way out: Settings → Themes → *Use the default look*, `/__gate/theme-off` (this browser), `aegis themes off`.

**The safety scan** reads the code statically and says what it touches: *styles only* (it can't run anything), the replaced pages that handle secrets (Settings: the password form; Burrow: tunnel passwords), calls to the dashboard's sensitive APIs and whether the page it replaces needs them, and what a look never needs: code made from text (`eval`, `new Function`), packed or obfuscated code, saved-password access. Those are **danger**: the host MUST ask the user to say they trust the author before it applies. The dashboard's content policy stays in force for every theme: nothing loads from other sites.

### 12.4 `.stability`

The proof that a theme is the very build that was tested, and how the test went. A host MUST check it and show the result; it MAY install an unproven theme after the live run and the user's confirm.

```
weft-stability 1
theme midnight 1.0.0
api 1
host burrow 2.45.0
made 2026-11-11T17:41:52.019Z
by aegis-burrow 2.45.0 (Settings → Themes)
check manifest ok midnight 1.0.0, api 1
check files ok 5 files, 0.2 MB
check syntax ok 0 scripts parse
check safety ok styles, 0 to know
check pages ok home drew, tunnels drew, settings drew
check errors ok 0 uncaught
check speed ok slowest page 2704 ms
file <sha256> <bytes> .theme
file <sha256> <bytes> previews/home.webp
file <sha256> <bytes> theme.css
seal <sha256 of every line above it, joined with \n>
```

- Plain UTF-8, one fact per line, `\n` line ends; `check ID ok|fail DETAIL`; one `file` line per file in the package except `.stability` itself (paths relative to the `.theme` folder, `/`-separated, sorted).
- **Making one** takes a live run on a real host: Aegis × Burrow, Settings → Themes → the theme → *Prove it stable*. It runs each page with the core host script watching, checks the rest, and refuses to write the file unless every check passes.
- **Checking one**, a host recomputes everything: the seal (a hand-edited line breaks it: *edited*), every file's SHA-256 (a file changed, added or missing: *changed since it was tested*), the theme and API (*made for another build*). Then the version: tested on this host's major.minor: **stable**; on an older one: *proven on X, you run Y*; on a newer one: *update the host*.
- It proves **consistency, not authorship**: anyone can make one for their own build. Trust in an author is the user's call; the safety scan informs it.

### 12.5 The core host script

Every signed-in page carries `/__gate/core/host.js` and `host.css` first, with its settings in `<script id="weft-host" type="application/json">`. A theme MUST NOT replace or remove them. The script catches the page's errors (and offers the default look back when a theme broke the page), reports the live run from a preview frame (`postMessage({type: "weft-theme-run", page, errors, ms, ok})` to its own origin), draws the user's background (12.6), and runs the welcome once per applied version: the theme's previews, the background picker, then the theme's `onboarding` steps. `window.WeftHost` exposes `welcome()`, `pickBackground()`, `setBackground(pick)`, `backgrounds()`; the page gets a `weft:background` event when it changes. Its markup uses `.wh-*` and `.weft-*` classes a theme MAY restyle.

### 12.6 Backgrounds

A theme with `backgrounds` draws behind the dashboard, and the user picks what:

- `builtin`: ≤ 8 of `{id, name, swatch}`: backgrounds the theme draws itself (an aurora, plain black). `swatch` is a CSS color or gradient for the picker (no `url()`). The host marks `html[data-bg="<id>"]` before the page paints; the theme's CSS does the rest.
- `recommended`: ≤ 24 of `{name, url, tags?, preview?}`: pictures the theme suggests: a wallpaperflare page, or a direct link to a picture, GIF or video. Only the link ships with the theme (and a small `preview` from the package, for the picker); the host downloads the picture when the user picks it.
- **The user's own**, kept on their machine only, never in a theme or the host: uploads (pictures, GIFs, .mp4/.webm videos) and links. **SVG never** (it can carry scripts). A host downloading a link MUST connect only to public addresses, checked again on every redirect. Pictures are kept in three sizes (≤ 3840, 1280 and 40 px wide; the browser makes them); GIFs and videos as they are, with a still. A video plays muted and looped; with reduced motion or data saving, the still shows instead.
- When a picture is in use the host marks `html[data-bg="media"]` and draws it in `.weft-bg` (`z-index: -1`, under the page) with a shade a theme MAY set: `--weft-shade`.

### 12.7 Discover: sharing a theme

**Fork this repository** and put your theme in the fork with its `.theme` file at the root (and its `.stability`, proven on a real host). Hosts list every fork of `alexd-aero/weft` that has a `.theme` at the root of its default branch, with its previews, under *Discover*, next to the examples in [`examples/themes`](examples/themes); a user previews and installs it with the usual report and confirm. Keep the fork's other files: the spec travels with your theme. A host MUST NOT apply a discovered theme without the same report, preview and confirm as any other.

