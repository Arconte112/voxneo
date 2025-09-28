# Repository Guidelines

## Project Structure & Module Organization
- `src/main` hosts the Electron main process and Groq transcription orchestration.
- `src/preload` defines context-bridge surfaces; extend `index.ts` when exposing new renderer APIs.
- `src/renderer` contains React entry points (`overlay.tsx`, `history.tsx`, `settings.tsx`), shared `components/`, hooks, and Tailwind styles in `styles/`.
- Shared contracts live in `src/shared` and `src/types`; assets reside in `assets/`, build output in `dist/`, and tooling under `scripts/`.

## Build, Test, and Development Commands
- `npm run dev` runs the main-process watcher, Vite dev server, and launches Electron for live reload.
- `npm run dev:main` or `npm run dev:renderer` focus on one bundle while tracing crashes or console noise.
- `npm run build` emits production bundles; verify via `npm run start` before publishing.
- `npm run lint` enforces ESLint across `.ts`/`.tsx`; resolve warnings prior to review.
- `npm run rebuild:native` refreshes native modules after dependency changes; use `npm run pack` or `npm run dist` to generate distributables.

## Coding Style & Naming Conventions
- Follow the existing TypeScript + ES module style: 2-space indentation, single quotes, and preference for early returns over deep nesting.
- Components use PascalCase filenames, hooks follow `useName` camelCase, and shared utilities stay camelCase.
- Prefer path aliases (`@shared/*`, `@types/*`) over long relative imports to keep modules readable.

## Testing Guidelines
- Automated tests are not yet configured; run `npm run dev` and exercise overlay, settings, and history flows after each change.
- Colocate future tests beside their sources (e.g., `src/renderer/components/Button.test.tsx`) and mirror filenames once a harness is introduced.
- Capture manual QA steps or known gaps in the PR description until automated coverage is available.

## Commit & Pull Request Guidelines
- Write concise, imperative commit subjects (~72 characters) that describe the change, mirroring the current history style.
- Keep commits scoped to one concern (main, renderer, shared types, or tooling) to simplify review and potential reverts.
- PRs must include a summary, testing or QA evidence, linked issues, and screenshots or recordings for UI changes.
- Request reviewers who own the touched area and flag migrations, schema updates, or new env vars explicitly.

## Security & Configuration Tips
- Store API keys in `.env`; exclude the file from commits and document required variables when they change.
- After altering native dependencies, run `npm run rebuild:native` on Windows and confirm the packaged app starts before merging.
