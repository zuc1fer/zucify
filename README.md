<div align="center">

# Zucify

**Music streaming client for desktop and mobile, with syllable-synced lyrics and reactive dynamic visuals.**

[![Electron](https://img.shields.io/badge/Electron-44.0-47848F?style=flat-square&logo=electron&logoColor=black&labelColor=white)](https://electronjs.org)
[![React 19](https://img.shields.io/badge/React_19-19.2-61DAFB?style=flat-square&logo=react&logoColor=black&labelColor=white)](https://react.dev)
[![TypeScript 5](https://img.shields.io/badge/TypeScript_5-5.0-3178C6?style=flat-square&logo=typescript&logoColor=black&labelColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS_v4-v4.0-06B6D4?style=flat-square&logo=tailwindcss&logoColor=black&labelColor=white)](https://tailwindcss.com)
[![WebAssembly](https://img.shields.io/badge/Rust-WebAssembly-654FF0?style=flat-square&logo=webassembly&logoColor=black&labelColor=white)](https://webassembly.org)

[Preview](#preview) •
[Architecture](#architecture) •
[Getting Started](#getting-started) •
[Building](#building) •
[Mobile Development](#mobile-development) •
[Contributing](#contributing) •
[License](#license)

<br/>

<img src="./.github/assets/lyrics_preview.png" alt="Zucify Fullscreen Lyrics" width="100%" />

</div>

---

## Preview

<div align="center">
  <table>
    <tr>
      <td align="center" width="50%">
        <img src="./.github/assets/home.png" alt="Zucify Home Page" />
        <br/>
        <sub><b>Home</b></sub>
      </td>
      <td align="center" width="50%">
        <img src="./.github/assets/demo.gif" alt="Zucify Fullscreen Mode Demo" />
        <br/>
        <sub><b>Fullscreen mode</b></sub>
      </td>
    </tr>
  </table>
</div>

---

> [!NOTE]
> Zucify is a personal client fork of [Liner Desktop](https://github.com/tryliner/desktop). It continues to use Liner's official API for the music catalog, streaming playback, accounts, and synchronized lyrics; this repository does not host that service or its account database.

---

## Architecture

```
zucify/
├── electron/
│   ├── main.ts              # Electron main process & IPC handlers
│   ├── preload.ts           # Context bridge & secure renderer bindings
│   ├── crypto.ts            # High-performance in-memory WebAssembly signer
│   └── signer.ts            # Embedded WebAssembly binary
├── src/
│   ├── assets/              # Static assets and media
│   ├── components/          # Shared reusable UI components
│   ├── features/            # Feature modules (player, lyrics, queue, library, search, auth)
│   ├── pages/               # Route views (Home, Search, Album, Artist, Playlist)
│   ├── shared/              # API client, state stores (Zustand), and data contracts
│   ├── App.tsx              # Application root
│   └── main.tsx             # Vite entry point
├── package.json
└── vite.config.ts
```

---

## Getting Started

### Prerequisites

- **Node.js** `v20+` and **pnpm** or **Bun**
- Modern OS (Windows 10/11, macOS, or Linux)

---

### Setup

```bash
# 1. Clone this repository
git clone https://github.com/zuc1fer/zucify.git
cd zucify

# 2. Install dependencies (pnpm or Bun)
pnpm install
# or
bun install
```

---

### Running in Development

```bash
# Start Zucify in development mode (Electron app with Vite hot-reload)
pnpm run dev
# or
bun run dev
```

---

## Testing

```bash
# Run test suite with Vitest
bun run test
# or
pnpm test
```

---

## Building

```bash
# Build desktop packages for your current OS:

# Linux (AppImage & .deb)
bun run electron:build:linux

# Windows (.exe installer)
bun run electron:build:win
```

Compiled distributions will be placed in the `release/` directory.

## Mobile Development

The React renderer is packaged for Android and iOS with Capacitor. After installing dependencies, build and sync the web app with `pnpm mobile:sync`.

- **Android:** Install Android Studio and an Android SDK, then use `pnpm mobile:android` to build and launch on a connected device or emulator. Use `pnpm mobile:android:open` to open the native project in Android Studio.
- **iOS:** On macOS with Xcode installed, use `pnpm mobile:ios` to build and launch, or `pnpm mobile:ios:open` to open the native project in Xcode.

Mobile playback controls use the device media session. Native builds must be synced after changing dependencies with `pnpm mobile:sync`.

Mobile launcher and splash artwork comes from `assets/logo.svg`. Regenerate platform assets with:

```bash
npm exec --yes --package=@capacitor/assets@3.0.5 -- capacitor-assets generate --android --ios --iconBackgroundColor "#10121A" --splashBackgroundColor "#080808"
```

---

## Contributing

This is a personal customization of Liner Desktop. Before redistributing changes or builds, review the original project's license and contribution terms.

---

## Special Thanks

- [`@braccato/core`](https://github.com/better-lyrics/braccato) & `@braccato/parsers` — Synced lyrics components and format parsers.
- [`@kawarp/react`](https://github.com/better-lyrics/kawarp) & `@kawarp/core` — WebGL background shader components.
- [Solar Icons](https://solar-icons.com) & [MingCute Icons](https://www.mingcute.com) — Icon collections.

---

## License

Zucify is based on [Liner Desktop](https://github.com/tryliner/desktop), whose terms are identified as the **Liner Source-Available & Non-Commercial Contribution License**. The upstream project describes personal non-commercial use, local builds, and upstream contributions as allowed; it lists commercial distribution, public competing forks, and extracting core algorithms for third-party products as prohibited. This checkout does not include a `LICENSE` file, so consult the upstream project for the authoritative terms before redistributing or using this code commercially.

