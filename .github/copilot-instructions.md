# Copilot Instructions

## Build, test, and lint commands

Use npm scripts from `package.json`:

- Install dependencies: `npm ci`
- Dev server: `npm start` (runs `ng serve`)
- Production build: `npm run build`
- Development watch build: `npm run watch`
- Full unit test suite (Karma/Jasmine): `npm test`
- Single spec file: `npm test -- --watch=false --include src/app/app.component.spec.ts --browsers=ChromeHeadless`
- Deploy to Firebase: `npm run deploy` (or hosting only: `npm run deploy:hosting`)

Linting is not currently configured in this repository (no `lint` script in `package.json` and no lint target in `angular.json`).

## High-level architecture

- This is an Angular 17 **standalone** application (no root `NgModule`):
  - `src/main.ts` bootstraps `AppComponent` via `bootstrapApplication`.
  - `src/app/app.config.ts` provides router + Firebase providers (`provideFirebaseApp`, `provideAuth`, `provideFirestore`).
  - `src/app/app.routes.ts` contains login and guarded workout routes.
- Auth uses Firebase Authentication with Google popup sign-in; logged-in user state is exposed via `AuthService.user$`.
- Workout persistence is Firestore-backed per user at `users/{uid}/workouts/{date}__{trainingDay}`.
- `src/app/app.component.ts` is a standalone root shell with auth-aware nav and sign-out action.
- Global app styles are in `src/styles.scss`; component styles default to SCSS.
- Build output is configured to `dist/workout-app`, with production budgets defined in `angular.json`.

## Key conventions in this codebase

- Prefer standalone Angular patterns (component `imports`) over module-based wiring.
- Keep route definitions centralized in `app.routes.ts` and route provider setup in `app.config.ts`.
- Protect workout routes with `authGuard`; keep login UI under `src/app/auth` and treat Google sign-in as the only supported auth flow.
- Use `YYYY-MM-DD__{trainingDay}` as workout document ID so sessions stay separate across Lower/Upper day slots on the same date.
- TypeScript and Angular template strictness are enabled (`strict`, `strictTemplates`, strict DI/input checks in `tsconfig.json`).
- Unit tests use Jasmine + Karma; for standalone components, tests import the component in `TestBed.configureTestingModule({ imports: [...] })` (not `declarations`).
- Formatting conventions include 2-space indentation and single quotes in TypeScript (`.editorconfig`).
