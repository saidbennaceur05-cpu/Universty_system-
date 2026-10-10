# UniAbsence

React 19 + Vite 8 + TypeScript app for university absence management (admin, teacher and student portals). Front-end only: data lives in `localStorage` behind an async API layer so a real backend can replace it later. UI language is French. See `README.md` for the demo accounts and feature list.

## Development

```bash
npm install
npm run dev        # Vite on http://localhost:8443 (port from vite.config.ts; Figma Make sets $PORT)
npm run typecheck  # tsc --noEmit — run before committing
npm run build      # production build in dist/
```

Inside Figma Make a dev server is already running on `$PORT` (default 8443) with hot reload; do not start another one there.

## Project structure

- `src/main.tsx` — React entrypoint; imports `src/index.css` and mounts `src/App.tsx`
- `src/App.tsx` — providers (auth, toasts, confirm) and the role-aware route table; add new screens here
- `src/types.ts` — domain model and shared constants (status labels, thresholds, upload limits)
- `src/data/seed.ts` — deterministic demo dataset, `FILIERES` / `NIVEAUX` / `GROUPES`, `academicYearOf()`
- `src/api/index.ts` — the application API (auth, students, teachers, subjects, sessions & roll call, absences, certificates, stats). Every function is async, validates its input, throws `ApiError(message, field?)` and logs to the activity feed. **UI code must go through this module only.**
- `src/api/db.ts` — localStorage persistence, `commit()` after mutations, React subscription (`subscribe`/`getVersion`)
- `src/api/crypto.ts` — password hashing (WebCrypto SHA-256 with fallback), temporary passwords, ids
- `src/api/useQuery.ts` — `useQuery(fn, deps)` re-runs after any mutation; `useMutation(fn)` returns `{ ok, data | error }` outcomes
- `src/router.ts` / `src/routes.ts` — hash router helpers and per-role navigation
- `src/auth.tsx` — session context (`useAuth`, `useSession`)
- `src/components/ui.tsx` — primitives: `Icon`, `Button`, `Field`, `SelectField`, `TextareaField`, badges, `Modal`, `ConfirmProvider`/`useConfirm`, `ToastProvider`/`useToast`, `Pagination`, `Tabs`, `EmptyState`, `Loading`
- `src/components/Shell.tsx` — sidebar + topbar layout driven by the nav items of the signed-in role
- `src/components/AbsenceTable.tsx`, `AbsenceDetail.tsx`, `CertificateUploadForm.tsx`, `StudentSearch.tsx` — shared feature components
- `src/pages/` — `Login.tsx`, `Account.tsx`, `admin/*`, `teacher/TeacherPages.tsx`, `student/StudentPages.tsx`
- `src/index.css` — all styling (hand-written CSS variables and classes; Tailwind is installed via `vite.config.ts` but no utility classes are used)
- `.figma/make/site.json` — title, language and meta description injected into `index.html` at build time

## Conventions

- Keep business rules in `src/api/index.ts`, not in components (status transitions, uniqueness, date checks).
- After a mutation, call `commit()` so persisted data and every `useQuery` refresh; never mutate `getDb()` from a component.
- Form field errors come from `ApiError.field`; map them with `mutation.error?.field === "<name>"`.
- Dates are ISO `YYYY-MM-DD` strings, times `HH:MM`; format for display with `src/utils/format.ts`.
- Use double quotes for strings containing apostrophes (`"L'étudiant"`); an unescaped apostrophe in a single-quoted string breaks the build.
- Pages are default or named exports from `src/pages/**`; shared components are named exports.
