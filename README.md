# webapp-wrapper

Transformez n'importe quelle webapp en application desktop native pour Linux, avec [Tauri](https://tauri.app/).

Bien plus léger qu'Electron (~5-10 Mo par app au lieu de ~150 Mo), utilise le webview système (WebKitGTK).

## ✨ Fonctionnalités

- 📦 Un seul projet pour wrapper plusieurs webapps
- 🪶 Ultra-léger grâce à Tauri (Rust + WebKitGTK)
- 🔧 Configuration par fichier JSON simple
- 🐧 Génère des paquets `.deb` installables sur Ubuntu/Debian
- 🎨 Téléchargement et conversion automatique de l'icône

## 📋 Prérequis

Sur Ubuntu/Debian :

```bash
# Dépendances système Tauri
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  imagemagick

# Rust (si pas déjà installé)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Tauri CLI
cargo install tauri-cli --version "^2.0"

# Node.js (via nvm — tu l'as déjà setup)
# nvm install --lts
```

## 🚀 Utilisation

### Lister les apps disponibles

```bash
npm run list
```

### Builder une app

```bash
npm run build:notion
# ou
npm run build claude
# ou directement
node scripts/build-app.js notion
```

Le `.deb` généré se trouve dans `src-tauri/target/release/bundle/deb/`.

### Installer

```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/Notion_0.1.0_amd64.deb
```

L'app apparaît ensuite dans ton menu d'applications GNOME (ou autre).

### Désinstaller

```bash
sudo apt remove notion   # ou le nom Cargo
```

## 📝 Ajouter une nouvelle app

Crée un fichier `apps/mon-app.json` :

```json
{
  "name": "MonApp",
  "identifier": "io.animalink.monapp",
  "url": "https://mon-app.com",
  "icon": "https://mon-app.com/favicon.ico",
  "width": 1280,
  "height": 800,
  "minWidth": 800,
  "minHeight": 600,
  "version": "0.1.0",
  "description": "MonApp as a desktop app",
  "category": "Productivity"
}
```

Puis :

```bash
node scripts/build-app.js mon-app
```

### Catégories valides

`AudioVideo`, `Audio`, `Video`, `Development`, `Education`, `Game`, `Graphics`, `Network`, `Office`, `Science`, `Settings`, `System`, `Utility`, `Productivity`

## 📦 Apps préconfigurées

| App       | URL                          | Description                        |
|-----------|------------------------------|------------------------------------|
| Notion    | notion.so                    | Workspace tout-en-un               |
| AppFlowy  | appflowy.com                 | Alternative open source à Notion   |
| SiYuan    | b3log.org/siyuan             | Notes block-based local-first      |
| Claude    | claude.ai                    | Assistant IA d'Anthropic           |
| ChatGPT   | chat.openai.com              | Assistant IA d'OpenAI              |

## 🧠 Comment ça marche

1. Le script `build-app.js` lit le JSON de l'app choisie
2. Il télécharge le favicon et le convertit en PNG 512×512 via ImageMagick
3. Il génère un `src-tauri/tauri.conf.json` qui dit à Tauri d'ouvrir l'URL dans une fenêtre native
4. Il lance `cargo tauri build` qui produit un binaire Rust + un paquet `.deb`
5. Le `.deb` contient l'exécutable, l'icône, un fichier `.desktop` pour l'intégration GNOME

L'app finale est un **binaire Rust** qui ouvre une fenêtre WebKitGTK pointant vers l'URL. Pas de Chromium embarqué, pas de Node.js runtime, juste le webview système.

## ⚠️ Limitations

- Les notifications natives nécessitent du code supplémentaire dans `main.rs` (non inclus ici)
- Certains sites détectent le webview et limitent des fonctionnalités (rare)
- Le webview système peut être un peu en retard sur Chromium pour les API web récentes
- Les badges d'icône (compteur de notifs) ne sont pas supportés par défaut

## 🛠 Améliorations possibles

- Tray icon (icône dans la barre système)
- Notifications natives (`tauri-plugin-notification`)
- Raccourcis globaux
- Profils multiples par app
- Adblock intégré
- Cible AppImage en plus de .deb

## 📄 Licence

MIT
