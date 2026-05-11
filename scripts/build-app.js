#!/usr/bin/env node
/**
 * build-app.js — Build a webapp wrapper for a specific app
 *
 * Usage:
 *   node scripts/build-app.js <app-name>
 *   npm run build:app -- notion
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const APPS_DIR = path.join(ROOT, 'apps');
const TAURI_DIR = path.join(ROOT, 'src-tauri');
const ICONS_DIR = path.join(TAURI_DIR, 'icons');
const CONF_PATH = path.join(TAURI_DIR, 'tauri.conf.json');
const CARGO_PATH = path.join(TAURI_DIR, 'Cargo.toml');

// ---------- helpers ----------

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`▶ ${msg}`);
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    client.get(url, (res) => {
      // handle redirects
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

async function generateIcons(sourceIconUrl, appName) {
  // Tauri on Linux needs at minimum a PNG icon.
  // We download the favicon and convert/copy it with ImageMagick if available.
  const tmpIcon = path.join(ICONS_DIR, `_${appName}-source`);
  const finalIcon = path.join(ICONS_DIR, 'icon.png');

  if (!fs.existsSync(ICONS_DIR)) fs.mkdirSync(ICONS_DIR, { recursive: true });

  log(`Downloading icon from ${sourceIconUrl}`);
  try {
    await downloadFile(sourceIconUrl, tmpIcon);
  } catch (err) {
    console.warn(`⚠ Could not download icon (${err.message}); using fallback`);
    // Fallback: create a 512x512 blank PNG via ImageMagick if no source
    try {
      execSync(`convert -size 512x512 xc:'#1a1a1a' "${finalIcon}"`, { stdio: 'inherit' });
      return;
    } catch {
      die('No icon available and ImageMagick (convert) not found. Install with: sudo apt install imagemagick');
    }
  }

  // Convert to PNG 512x512 (Tauri/Linux preferred size)
  try {
    execSync(`convert "${tmpIcon}" -resize 512x512 -background none -gravity center -extent 512x512 "${finalIcon}"`, { stdio: 'inherit' });
    fs.unlinkSync(tmpIcon);
  } catch (err) {
    // If convert fails (e.g. SVG without rsvg), fall back to a copy if it's already PNG
    if (sourceIconUrl.endsWith('.png')) {
      fs.copyFileSync(tmpIcon, finalIcon);
      fs.unlinkSync(tmpIcon);
    } else {
      die(`Icon conversion failed: ${err.message}. Install: sudo apt install imagemagick librsvg2-bin`);
    }
  }
}

// ---------- main ----------

async function main() {
  const appName = process.argv[2];
  if (!appName) {
    console.log('Available apps:');
    fs.readdirSync(APPS_DIR)
      .filter(f => f.endsWith('.json'))
      .forEach(f => console.log(`  - ${f.replace('.json', '')}`));
    die('Usage: node scripts/build-app.js <app-name>');
  }

  const configPath = path.join(APPS_DIR, `${appName}.json`);
  if (!fs.existsSync(configPath)) {
    die(`App config not found: ${configPath}`);
  }

  const appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  log(`Building wrapper for: ${appConfig.name} (${appConfig.url})`);

  // 1. Generate icon
  await generateIcons(appConfig.icon, appName);

  // 2. Generate tauri.conf.json from template
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
      targets: ["deb"],
      icon: ["icons/icon.png"],
      category: appConfig.category || "Utility",
      shortDescription: appConfig.description || `${appConfig.name} as desktop app`,
      longDescription: appConfig.description || `${appConfig.name} packaged as a native Linux desktop application via Tauri`,
      linux: {
        deb: {
          depends: ["libwebkit2gtk-4.1-0", "libgtk-3-0"]
        }
      }
    }
  };

  fs.writeFileSync(CONF_PATH, JSON.stringify(conf, null, 2));
  log(`Wrote ${CONF_PATH}`);

  // 3. Update Cargo.toml package name to match (kebab-case)
  const cargoName = appName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  let cargo = fs.readFileSync(CARGO_PATH, 'utf8');
  cargo = cargo.replace(/^name = ".*"/m, `name = "${cargoName}"`);
  fs.writeFileSync(CARGO_PATH, cargo);

  // 4. Run tauri build
  log('Running: cargo tauri build');
  try {
    execSync('cargo tauri build', {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env }
    });
  } catch (err) {
    die('Tauri build failed');
  }

  // 5. Locate the .deb
  const debDir = path.join(TAURI_DIR, 'target', 'release', 'bundle', 'deb');
  if (fs.existsSync(debDir)) {
    const debs = fs.readdirSync(debDir).filter(f => f.endsWith('.deb'));
    if (debs.length) {
      console.log('\n✅ Build complete!');
      console.log(`📦 Package: ${path.join(debDir, debs[0])}`);
      console.log(`\nInstall with:`);
      console.log(`  sudo dpkg -i "${path.join(debDir, debs[0])}"`);
    }
  }
}

main().catch(err => die(err.message));
