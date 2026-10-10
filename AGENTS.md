# UniAbsence

React 19 + Vite 8 + TypeScript. **Administration-only** platform for managing university absences
(no teacher or student portals). Front-end only: data lives in `localStorage` behind one async API
module that a backend will replace. UI language is French. See `README.md` for features/accounts and
`API_CONTRACT.md` for the backend handoff.

## Development

```bash
npm install
npm run dev        # Vite on http://localhost:8443
npm run typecheck  # tsc --noEmit — run before committing
npm run build      # production build in dist/
```

## Project structure

- `src/App.tsx` — providers (auth, toasts, confirm) + the hash-route table. Add screens here.
- `src/types.ts` — domain model, `Settings`, read models, shared constants.
- `src/data/seed.ts` — deterministic demo data, default filières/niveaux/groupes, `academicYearOf`.
- `src/api/index.ts` — **the application API and the backend contract**. Every function is async,
  validates input, throws `ApiError(message, field?)`, and writes an audit entry. UI goes through here only.
- `src/api/db.ts` — localStorage persistence; `commit()` after each mutation; React subscription.
- `src/api/crypto.ts` — password hashing (demo; real hashing belongs on the server).
- `src/api/useQuery.ts` — `useQuery(fn, deps)` refetches after any mutation; `useMutation(fn)` returns
  `{ ok: true, data } | { ok: false, error }` — branch on `.ok`, don't read `.error` state in the handler.
- `src/router.ts` / `src/routes.ts` — hash router + the two nav groups (Gestion / Configuration).
- `src/auth.tsx` — session context; `isSuperAdmin` gates super-admin-only screens.
- `src/components/ui.tsx` — primitives (Icon, Button, Field, Modal, Tabs, Pagination, toasts, confirm…).
- `src/components/Shell.tsx` — sidebar + topbar; nav filtered by role.
- `src/components/` — `AbsenceTable`, `AbsenceDetail`, `CertificateUploadForm`, `StudentSearch`.
- `src/utils/` — `format.ts`, `csv.ts` (CSV parse/build/download + import templates).
- `src/pages/admin/` — Dashboard, Students, Absences, Certificates, AtRisk, Reports, Import, Subjects,
  Teachers, Accounts, Audit, Settings.
- `src/index.css` — all styling (hand-written; Tailwind is installed but unused).

## Roles

`super-admin` sees everything. `staff` sees Gestion + Matières/Enseignants but not Accounts, Settings or
Audit (nav hides them and `App.tsx` redirects). Enforce the same on a real server.

## Conventions

- Business rules live in `src/api/index.ts`, never in components.
- After a mutation call `commit()`; never mutate `getDb()` from a component.
- Field errors come from `ApiError.field`; map with `mutation.error?.field === "<name>"`.
- Mutations that then log must not log inside an effect that depends on the refetched query result
  (it loops: log → commit → refetch → new data → effect). Use a ref to fire once. (See `AtRisk` NoticeModal.)
- Dates ISO `YYYY-MM-DD`, times `HH:MM`; format via `src/utils/format.ts`. Academic year is relative to
  `settings.academicYearStartMonth`.
- Double-quote strings containing apostrophes (`"L'étudiant"`).
