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

1. **Steamworks partner account, App ID and depots.** Needs the user's own Valve account and the
   app fee. Until there is an App ID nothing below can be tested against real Steam.
2. **`steamworks.js` integration.** Add the dependency; initialise it in the main process only;
   expose just the calls the game needs (achievements, rich presence, cloud saves) as new methods
   on `ShellBridge`, validated in `electron/ipcHandlers.cts`. It is a native module, so
   `asarUnpack` it in `electron-builder.yml` and revisit `npmRebuild: false`. For local runs it
   expects a `steam_appid.txt` next to the executable (do not ship that file). Its README also lists
   Chromium switches needed for the Steam overlay on Windows; read it when integrating, we have
   not checked them against the current Electron.
3. **SteamPipe upload.** Install `steamcmd`, write `app_build_<id>.vdf` and `depot_build_<id>.vdf`
   pointing at `release/<platform>-unpacked`, and upload with a build account. Keep the account
   credentials out of the repo (CI secrets or a local login). The CI workflow deliberately does
   not do this.
4. **Per-platform builds.** `electron-builder` should be run on its own OS (or in CI per OS); only
   Linux has been tried here. macOS needs signing and notarisation; Windows benefits from signing.
5. **`appId` in `electron-builder.yml`** is a placeholder (`io.github.bjor2.steampunkminer`).
6. **Saves.** There is no save system yet. When there is one it goes behind a checkpoint seam and,
   for Steam Cloud, the shell.
7. **Input and display.** Steam Input / Steam Deck support, fullscreen toggle, window state.
8. **Debug API in release.** `?debug` / `?scenario=` are honoured by the shell in any build; decide
   whether a Steam release should ignore them (they are cheats).
9. **Auto-update** is not wanted on Steam (Steam updates the depot); do not add `electron-updater`.
