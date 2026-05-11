#!/usr/bin/env node
/**
 * build-app.js — Build the Notion desktop wrapper
 *
 * Usage:
 *   node scripts/build-app.js [app-name]   (defaults to "notion")
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APPS_DIR = path.join(ROOT, 'apps');
const TAURI_DIR = path.join(ROOT, 'src-tauri');
const ICONS_DIR = path.join(TAURI_DIR, 'icons');
const CONF_PATH = path.join(TAURI_DIR, 'tauri.conf.json');
const CARGO_PATH = path.join(TAURI_DIR, 'Cargo.toml');

const PLATFORM = os.platform(); // 'linux' | 'win32' | 'darwin'

// ---------- helpers ----------

function die(msg) {
  console.error(`X ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`> ${msg}`);
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(res.headers.location, destPath).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(destPath, () => reject(err));
    });
  });
}

function imagemagick(args) {
  // ImageMagick 7 ships `magick`; IM 6 / Linux distros ship `convert`.
  // On Windows, `convert` collides with a built-in shell command, so prefer `magick`.
  const candidates = PLATFORM === 'win32'
    ? ['magick', 'magick convert']
    : ['magick convert', 'convert'];
  for (const cmd of candidates) {
    const [bin, ...rest] = cmd.split(' ');
    const result = spawnSync(bin, [...rest, ...args], { stdio: 'inherit' });
    if (result.status === 0) return true;
    if (result.error && result.error.code === 'ENOENT') continue;
    if (result.status !== 0) return false;
  }
  return false;
}

async function generateIcons(sourceIconUrl) {
  const tmpIcon = path.join(ICONS_DIR, '_source');
  const pngIcon = path.join(ICONS_DIR, 'icon.png');
  const icoIcon = path.join(ICONS_DIR, 'icon.ico');

  if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

  log(`Downloading icon from ${sourceIconUrl}`);
  try {
    await downloadFile(sourceIconUrl, tmpIcon);
  } catch (err) {
    console.warn(`! Could not download icon (${err.message}); generating fallback`);
    if (!imagemagick(['-size', '512x512', "xc:#1a1a1a", pngIcon])) {
      die('No icon and ImageMagick unavailable. Install: sudo apt install imagemagick (Linux) or use the Windows runner default.');
    }
  }

  if (fs.existsSync(tmpIcon)) {
    log('Generating icon.png (512x512)');
    if (!imagemagick([tmpIcon, '-resize', '512x512', '-background', 'none', '-gravity', 'center', '-extent', '512x512', pngIcon])) {
      die('Icon PNG conversion failed (ImageMagick required).');
    }

    log('Generating icon.ico (multi-size for Windows)');
    if (!imagemagick([tmpIcon, '-define', 'icon:auto-resize=256,128,96,64,48,32,16', icoIcon])) {
      console.warn('! Could not generate icon.ico — Windows bundle may use a default icon.');
    }

    fs.unlinkSync(tmpIcon);
  }
}

function bundleTargetsForPlatform() {
  switch (PLATFORM) {
    case 'linux': return ['deb'];
    case 'win32': return ['nsis'];
    case 'darwin': return ['dmg', 'app'];
    default: return [];
  }
}

function bundleOutputDir() {
  return path.join(TAURI_DIR, 'target', 'release', 'bundle');
}

function reportArtifacts() {
  const root = bundleOutputDir();
  if (!fs.existsSync(root)) return;
  const found = [];
  for (const sub of fs.readdirSync(root)) {
    const dir = path.join(root, sub);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/\.(deb|exe|msi|dmg|AppImage)$/i.test(f)) {
        found.push(path.join(dir, f));
      }
    }
  }
  if (found.length) {
    console.log('\nBuild complete. Artifacts:');
    found.forEach(p => console.log(`  ${p}`));
  }
}

// ---------- main ----------

async function main() {
  const appName = process.argv[2] || 'notion';
  const configPath = path.join(APPS_DIR, `${appName}.json`);
  if (!fs.existsSync(configPath)) {
    die(`App config not found: ${configPath}`);
  }

  const appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  log(`Building wrapper for: ${appConfig.name} (${appConfig.url}) on ${PLATFORM}`);

  await generateIcons(appConfig.icon);

  const targets = bundleTargetsForPlatform();
  if (!targets.length) die(`Unsupported platform: ${PLATFORM}`);

  const iconsList = ['icons/icon.png'];
  if (fs.existsSync(path.join(ICONS_DIR, 'icon.ico'))) iconsList.push('icons/icon.ico');

  const conf = {
    "$schema": "https://schema.tauri.app/config/2",
    productName: appConfig.name,
    version: appConfig.version || '0.1.0',
    identifier: appConfig.identifier,
    build: {
      frontendDist: "../public"
    },
    app: {
      windows: [
        {
          title: appConfig.name,
          width: appConfig.width || 1280,
          height: appConfig.height || 800,
          minWidth: appConfig.minWidth || 800,
          minHeight: appConfig.minHeight || 600,
          url: appConfig.url,
          resizable: true,
          fullscreen: false
        }
      ],
      security: { csp: null }
    },
    bundle: {
      active: true,
      targets,
      icon: iconsList,
      category: appConfig.category || "Utility",
      shortDescription: appConfig.description || `${appConfig.name} as desktop app`,
      longDescription: appConfig.description || `${appConfig.name} packaged as a native desktop application via Tauri`,
      linux: {
        deb: {
          depends: ["libwebkit2gtk-4.1-0", "libgtk-3-0"]
        }
      }
    }
  };

  fs.writeFileSync(CONF_PATH, JSON.stringify(conf, null, 2));
  log(`Wrote ${CONF_PATH} (targets: ${targets.join(', ')})`);

  const cargoName = appName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  let cargo = fs.readFileSync(CARGO_PATH, 'utf8');
  cargo = cargo.replace(/^name = ".*"/m, `name = "${cargoName}"`);
  fs.writeFileSync(CARGO_PATH, cargo);

  log('Running: cargo tauri build');
  try {
    execSync('cargo tauri build', {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env }
    });
  } catch {
    die('Tauri build failed');
  }

  reportArtifacts();
}

main().catch(err => die(err.message));
