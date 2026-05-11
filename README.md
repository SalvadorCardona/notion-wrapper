# notion-wrapper

Notion as a native desktop application (Linux `.deb` + Windows `.exe`), built with [Tauri](https://tauri.app/).

Much lighter than Electron (~5-10 MB instead of ~150 MB): uses the system webview (WebKitGTK on Linux, WebView2 on Windows).

## Features

- Native desktop window pointing at https://www.notion.so
- Cross-platform builds: Linux `.deb` and Windows NSIS `.exe`
- Automatic icon download and conversion (PNG + ICO)
- Continuous integration via GitHub Actions

## Prerequisites (local build)

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl wget file \
  libxdo-dev libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev imagemagick

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
cargo install tauri-cli --version "^2.0"
```

### Windows

- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on Windows 11)
- [ImageMagick](https://imagemagick.org/script/download.php#windows) (`magick` on `PATH`)
- Node.js 20+
- `cargo install tauri-cli --version "^2.0"`

## Build

```bash
npm run build:notion
```

Artifacts:

- Linux: `src-tauri/target/release/bundle/deb/Notion_<version>_amd64.deb`
- Windows: `src-tauri/target/release/bundle/nsis/Notion_<version>_x64-setup.exe`

## Install

### Linux

```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/Notion_*_amd64.deb
```

Notion appears in the GNOME (or other) application menu under *Productivity*.

### Windows

Run the generated `Notion_<version>_x64-setup.exe` installer.

## Continuous integration

`.github/workflows/build.yml` builds both targets in parallel:

- `ubuntu-22.04` -> `.deb`
- `windows-latest` -> `.exe` (NSIS)

Artifacts are uploaded under `notion-wrapper-linux-deb` and `notion-wrapper-windows-exe`.

Triggers: pushes/PRs on `main`, version tags (`v*`), and manual `workflow_dispatch`.

## How it works

1. `scripts/build-app.js` reads `apps/notion.json`
2. Downloads the Notion favicon, generates `icons/icon.png` (512x512) and `icons/icon.ico` (multi-size) via ImageMagick
3. Generates `src-tauri/tauri.conf.json` with platform-appropriate bundle targets
4. Runs `cargo tauri build`, which produces a native binary plus the platform installer

The final app is a Rust binary opening a system webview pointed at Notion. No bundled Chromium, no Node runtime.

## Limitations

- Native notifications need extra Rust code in `src-tauri/src/main.rs` (not included)
- Some sites detect the webview and limit features (rare)
- The system webview can lag behind Chromium for cutting-edge web APIs
- Icon badges (notification counters) are not supported by default

## License

MIT
