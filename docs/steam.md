# Shipping to Steam

Status: **the Electron shell exists; Steam itself is not configured.** No Steam credentials, App ID
or Steamworks code are in this repo, and nothing here needs them.

## What exists

- `electron/` – main process, sandboxed preload, minimal typed bridge (`window.steampunkShell`;
  contract in `electron/bridgeContract.cts`). The renderer only talks to it through `src/shell/`.
- `electron-builder.yml` – produces an **unpacked game folder** per platform (`dir` targets), which
  is what a Steam depot wants. Output goes to `release/`.
- Scripts: `npm run electron:dev` (compiles `electron/`, starts Vite, opens the window against it),
  `npm run electron:build` (typecheck, Vite build, compile `electron/`, package).
- The packaged app loads `dist/index.html` over `file://`, hence `base: './'` in `vite.config.ts`.
- Run logs are written to `<userData>/logs/<runId>/` by `electron/runLogFiles.cts`
  (design doc section 23). Check `app.getPath('userData')` on each OS when you want to find them.

Verified when this was set up: `electron-builder --dir --linux` packages without errors. The
Electron window itself has **not** been launched in this setup (no GUI available), so
`electron:dev` is untested at runtime.

## What remains (not done)

Decided in [the Steam and Electron research ticket](https://github.com/bjor2/steampunk-miner/issues/12)
(research done 4 Oct 2026; nothing here has been run).

1. **Partner account, App ID, depots (human, longest lead).** Identity, bank and tax paperwork,
   US$100 per app (non-refundable, recoupable at US$1,000 adjusted gross revenue), 21 days from fee
   to release, a 1-5 day review, and a public "coming soon" page for two weeks before release.
   Define one depot per OS (Windows, Linux).
2. **Library: `steamworks.js` 0.4.0, main process only, narrow bridge.** Open item: a spike on
   Electron 44.5.1 (init, overlay on each OS, crash check, frame cost of `in-process-gpu`).
   Fallback: `steamworks-ffi-node`. Packaging: allow `steamworks.js` through the `node_modules`
   exclusion, `asarUnpack` it, and copy the OS redistributable library next to the executable. Do
   not ship `steam_appid.txt`. New capabilities become new `ShellBridge` methods, validated in
   `electron/ipcHandlers.cts`.
3. **SteamPipe.** Build per OS on its own CI runner; upload by hand with `steamcmd` to a beta branch
   via `app_build_<id>.vdf` (`SetLive` = the beta branch name). Builder account credentials stay out
   of the repo and CI.
4. **Per-platform builds.** Windows and Linux in the slice; macOS later (signing and notarisation).
5. **`appId` in `electron-builder.yml`** is a placeholder (`io.github.bjor2.steampunkminer`).
6. **Saves.** One file per slot at `<userData>/saves/slot-<n>.json` (`userData` is `%APPDATA%\<name>`,
   `~/.config/<name>` or `~/Library/Application Support/<name>`), written atomically at each dock
   and on travel, behind the checkpoint seam. Steam Auto-Cloud with one root and per-OS overrides;
   set the quota and publish the Cloud settings.
7. **Input and display.** Steam Input and Steam Deck verification are post-slice; the reference size
   is 1280x800; Valve's Verified checklist is the later target.
8. **Debug API in release.** Off by default in release builds; a debug-flagged run never unlocks
   achievements or stats and never writes into the cloud save path (details in the logging ticket).
9. **Still unverified.** The order of `electronEnableSteamOverlay` relative to app ready, overlay
   behaviour on Linux, and macOS signing and notarisation.
10. **Auto-update** is not wanted on Steam (Steam updates the depot); do not add `electron-updater`.
