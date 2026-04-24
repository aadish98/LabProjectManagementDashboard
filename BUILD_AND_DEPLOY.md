# Build & Deploy

Three things to keep separate: **dev modes** (local only), **build artifacts** (what you produce), and **distribution targets** (how users get it).

## Dev modes (local only)

| Script | Runs | Window | Rust? | Use when |
|---|---|---|---|---|
| `npm run web:dev` | Vite dev server at `http://localhost:5173` | Browser | No | Iterating on UI/logic. 95% of the time. |
| `npm run dev` (= `tauri:dev`) | Vite + debug Rust binary | Native Tauri window | Yes | Verifying the desktop shell / webview behavior. |
| `npm run preview` | Static server for `dist/` at `http://localhost:4173` | Browser | No | Sanity-checking the production bundle before deploy (run `frontend:build` first). |
| `npm run typecheck` | `tsc --noEmit` | — | No | Pre-commit / CI. Type errors only, no runtime. |

All dev modes hit **real Google Sheets** — there is no mock/demo data path.

## Build artifacts

| Script | Output | Notes |
|---|---|---|
| `npm run frontend:build` | `dist/` (static `index.html` + hashed `assets/*`) | Runs `tsc` first, so type errors fail the build. Pure HTML/CSS/JS — deployable to any static host. |
| `npm run build` (= `tauri:build`) | `src-tauri/target/release/bundle/{macos,dmg,msi}/...` | Runs `frontend:build` first, then bundles into native installers per `src-tauri/tauri.conf.json` `bundle.targets`. |

## Distribution targets

### 1. Static web app (recommended for lab members)

```bash
npm run frontend:build
# upload dist/ to any static host
```

Hosts that work out of the box: Vercel, Netlify, Cloudflare Pages, GitHub Pages, S3 + CloudFront, any nginx.

Example one-liner:

```bash
npx vercel deploy --prod ./dist
```

**Required:** add the production origin (e.g. `https://lab-workflow.your-domain`) under **Authorized JavaScript origins** in the Google Cloud Console for your Web OAuth client.

**Pros:** zero install for users, push updates by re-uploading `dist/`, OAuth works exactly as in `web:dev`.
**Cons:** needs a host (free tiers are fine).

### 2. Tauri desktop app

```bash
npm run build  # on macOS for .dmg, on Windows for .msi
```

Distribute the resulting installer (email, GitHub Releases, internal share).

**Pros:** native window, app icon in dock, future OS integrations (notifications, keychain, file system).
**Cons:**
- Build host matches target OS (Mac for `.dmg`, Windows for `.msi`), or set up CI with both.
- **Code signing & notarization required** for clean install — Apple Developer cert (~$99/yr), Windows code signing cert. Without them, users see "unidentified developer" / SmartScreen warnings.
- OAuth needs a separate **Desktop application** OAuth client + a code change to use the loopback flow instead of GIS `initTokenClient`. The current auth module targets the browser only.
- Updates: ship a new installer or wire up the [Tauri updater plugin](https://v2.tauri.app/plugin/updater/).

### 3. Hybrid

Static web for everyday use, Tauri build for users who want a desktop app. Both share the same `src/` codebase. The auth module would need to detect `window.__TAURI__` and pick a flow accordingly.

## What to run when

| Goal | Command(s) |
|---|---|
| Edit a component, see it live | `npm run web:dev` |
| Catch type errors before push | `npm run typecheck` |
| Verify the bundle you're about to deploy | `npm run frontend:build && npm run preview` |
| Deploy to web | `npm run frontend:build` then upload `dist/` |
| Verify the desktop window/webview works | `npm run dev` |
| Produce a `.dmg` or `.msi` to send to a user | `npm run build` (on the matching OS) |

## Recommended path for this project

For a small lab with mixed Google account types and no signing certs yet: **static web deploy** is the lowest-effort path. Keep `tauri:dev` / `tauri:build` available as a future upgrade, but do not block on them.

## Gaps worth knowing about

- **No automated tests** (no `vitest`/`jest`/`playwright`). "Testing" = open the app and click around.
- **No staging environment.** Whatever `.env` is on disk at build time is what's baked in. Add `.env.staging` + `vite build --mode staging` if you need it.
- **No environment-based mode switching in code.** `import.meta.env.DEV` is available but unused.
