## Goal
When users save the site to their home screen on iOS/Android, the icon should be the Aquatic Dreams logo (the uploaded `AQD_Favicon-2.png`).

## Steps

1. **Copy the uploaded logo into `public/`** as `pwa-icon-source.png` and generate three properly-sized PNGs with ImageMagick (via nix):
   - `public/icon-192.png` (192×192) — Android home screen
   - `public/icon-512.png` (512×512) — Android splash / high-DPI
   - `public/apple-touch-icon.png` (180×180) — iOS home screen
   Also overwrite `public/favicon.png` (browser tab) at 64×64.

2. **Create `public/manifest.webmanifest`** with:
   - `name`: "Aquatic Dreams"
   - `short_name`: "Aquatic Dreams"
   - `start_url`: "/"
   - `display`: "standalone"
   - `background_color` / `theme_color`: brand teal `#2a5e84`
   - `icons` array referencing `icon-192.png` and `icon-512.png` (both with `purpose: "any maskable"`)

3. **Update `index.html` `<head>`** to register the icons:
   - `<link rel="icon" href="/favicon.png" type="image/png">`
   - `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`
   - `<link rel="manifest" href="/manifest.webmanifest">`
   - `<meta name="theme-color" content="#2a5e84">`
   - `<meta name="apple-mobile-web-app-capable" content="yes">`
   - `<meta name="apple-mobile-web-app-title" content="Aquatic Dreams">`

4. **Delete `public/favicon.ico`** so the browser doesn't fall back to the old default icon.

## Notes
- **No service worker / `vite-plugin-pwa`** is needed — a plain manifest + icons is enough for "Add to Home Screen" installability and avoids preview-iframe caching problems.
- Existing installs on devices won't update automatically (manifest fields are pinned at install time); users who already added it must re-add to see the new icon.
- No app code or routes change.