# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the React renderer: route setup is in `src/app/`, product areas live under `src/features/`, reusable contracts and utilities under `src/shared/`, and static media under `src/assets/`. `electron/` holds the desktop main process, preload bridges, and IPC features. The optional native addon is in `native/snap-preview/`; `signer/` contains signer sources, while `scripts/` holds build helpers. Put tests beside the code they cover as `*.test.ts` or `*.test.tsx`.

## Build, Test, and Development Commands

Use pnpm from the repository root (`pnpm-lock.yaml` is authoritative):

- `pnpm install` installs dependencies.
- `pnpm dev` starts the Vite development workflow.
- `pnpm test` runs the Vitest suite once; `pnpm test:watch` keeps it running during edits.
- `pnpm build` runs the TypeScript project build and Vite production build.
- `pnpm electron:build:win`, `pnpm electron:build:linux`, or `pnpm electron:build:mac` packages the desktop app for that platform. Windows packaging also builds the native addon.

## Coding Style & Naming Conventions

Follow the existing TypeScript and React patterns: two-space indentation, double-quoted imports, semicolons, PascalCase React component names, and camelCase functions and utilities. Use the `@/` alias for imports from `src/`. Keep feature-specific code in its feature directory and shared behavior in `src/shared/`. No separate lint or formatter command is configured; match nearby files.

## Testing Guidelines

Vitest runs tests in `jsdom` and includes `src/**/*.test.ts(x)` and `electron/**/*.test.ts`. Name tests after the module or behavior they cover, and add focused cases for changed behavior. Run `pnpm test` before submitting; run `pnpm build` when a change affects TypeScript or bundling.

## Commit & Pull Request Guidelines

Recent commits use conventional prefixes such as `feat`, `fix`, and `chore`, sometimes with a scope (`fix(player): ...`). Keep subjects concise and action-oriented. PRs should explain the user-visible change, link related issues when available, and report validation commands and results. Include screenshots for UI changes and note the target OS for Electron or native-addon changes.

## Security & Configuration

Use `.env.example` to understand supported local configuration. Keep real credentials and tokens in local environment files; never commit them. Preserve the Electron main/preload boundary when adding renderer access to privileged APIs.
