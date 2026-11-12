# OI Gold AI central UI updates

Browser extensions for the user's locally hosted [AI Roundtable](https://github.com/QZXP27/ai-roundtable). The Windows server and Codex login stay on the user's PC. This folder publishes UI source only; no API keys, OI access codes, chat histories, or market account data belong here.

## User workflow

Run the central-updater EXE once on Windows, after closing the previous launcher window. It backs up and patches the installed HTML, retaining the running server. Then refresh the existing local/Tailscale URL. The page displays `หน้า AI v1.0.0 · อัปเดตจากส่วนกลางแล้ว` after loading a verified central release.

Subsequent UI/data-connector updates require only a page refresh (finish the active debate first). This is not a remote Windows administrator or a Python/EXE updater. Changes to the local server, dependencies, or Windows launcher may still need a separate upgrade.

## Release format

`manifest.json` uses schema 1: a semantic version, immutable content-addressed JS filename and its SHA-256. The loader fetches the manifest from this fixed repository, validates the filename and content hash, then runs the bundle in the existing page. It checks only on page load, not during a debate. Updates therefore trust the write access to this repository. The hash detects mismatched/partial downloads, not a malicious repository owner.

On network/validation failure it uses a hash-verified local browser cache or the bundled first version. It caches a release only after successful script initialization. Cache stores public UI code only. Existing releases must remain available for clients with an older manifest. A bad runtime release can be rolled back by restoring the previous manifest; clients refresh to load it.

## Maintaining the release

Sources are in `launcher/mobile.html` and `launcher/oi-data.html`. From this directory:

1. Edit those source files. Increment the version in `launcher/build-ui.py`.
2. Run `python3 launcher/build-ui.py` and `node --check launcher/update-loader-built.js`.
3. Run `node launcher/test-oi-data.cjs` and `node launcher/test-updater.cjs`.
4. Commit the sources, new `ui-<sha256>.js` and `manifest.json` together. Do not replace old content-addressed bundles.
5. Verify the published manifest and bundle. Users refresh the existing URL.

Rebuilding the EXE is only needed to change the loader/local launcher. It is built on Linux with GCC/binutils using `python3 launcher/build.py`; create `/mnt/data` first. No Windows runtime validation is implied by compilation.

## Scope and data

The read-only data connector loads `api=data&sym=gold` from the same Apps Script endpoint as OI Gold Pro, with the code entered in the local browser. It attaches levels, options volume, saved dashboard analysis, sheet price and source timestamps to the topic, so both participants see the same snapshot. It does not include live chart/Footprint or all browser-derived dashboard metrics. Codes are held only in the input and request; they are not stored in the UI cache or added to model prompts. Data is sent to debate providers only when the user starts the debate.

## Source/license

These browser extensions and launcher modifications are available under AGPL-3.0-or-later. Upstream AI Roundtable source and its license are at https://github.com/QZXP27/ai-roundtable. Preserve the source links and notices when modifying/distributing the combined app. The local page links here for the corresponding extension source.
