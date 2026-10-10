# UniAbsence — API contract (for the backend)

The whole UI talks to one module: `src/api/index.ts`. Today it is implemented against `localStorage`
(`src/api/db.ts`). To plug in a real backend, **re-implement each exported function below with `fetch`
calls, keeping the same signatures, return types, and thrown errors.** No UI file needs to change.

## Ground rules

- Every function is `async`.
- On a business/validation problem, throw `ApiError(message: string, field?: string)`. `message` is shown
  to the user (French); `field` (optional) maps the error to a form input. Keep this behaviour: the forms
  read `error.field` to highlight the right input.
- Mutations return the updated/created entity (or a small result object). Lists return `Paged<T>`.
- IDs are opaque strings. Dates are `"YYYY-MM-DD"`, times `"HH:MM"`, timestamps ISO 8601.
- The server owns auth. Replace `src/api/crypto.ts` password hashing with real server-side hashing
  (bcrypt/argon2). The current client-side hash is a demo stand-in only.
- `src/api/useQuery.ts` re-runs every query after any mutation via a local version counter. With a real
  backend, either keep that (queries refetch after mutations) or swap for your data layer of choice;
  the pages only use `useQuery`/`useMutation`, so changing their internals is safe.

## Auth & session

| Function | In | Out |
|---|---|---|
| `bootstrap()` | — | `AuthSession \| null` (restore session on load) |
| `login(email, password)` | credentials | `AuthSession`; throws on bad creds / disabled account |
| `logout()` | — | `void` |
| `changePassword(current, next)` | passwords | `AuthSession`; validates strength, forbids reuse |

`AuthSession = { user: AdminUser }`. Roles: `"super-admin"` (full access) and `"staff"` (everything
except admin accounts, settings and audit log). Enforce role on the server too; the client guards are
convenience only.

## Admin accounts (super-admin only)

`listAdmins()`, `createAdmin(input) -> {admin, temporaryPassword}`, `updateAdmin(id, input)`,
`setAdminStatus(id, "active"|"disabled")`, `resetAdminPassword(id) -> temporaryPassword`,
`deleteAdmin(id)`. Rules enforced: at least one active super-admin must remain; you can't disable/delete
/demote yourself into breaking that.

## Settings & reference data (read by everyone, write super-admin)

`getSettings()`, `updateSettings(Partial<Settings>)`, `resetDemoData()` (demo only — drop server-side).
`Settings` holds `institutionName`, `subjectThreshold`, `overallThreshold`, `filieres[]`, `niveaux[]`,
`groupes[]`, `academicYearStartMonth`. Subjects: `listSubjects`, `createSubject`, `updateSubject`,
`deleteSubject` (blocked if sessions reference it). Teachers: `listTeachersSimple`, `createTeacher`,
`updateTeacher`, `deleteTeacher` (blocked if sessions reference it). `listGroups()` returns distinct
(filière, niveau, groupe) with counts.

## Students

`listStudents(filters) -> Paged<Student>`, `listAllStudents(filters) -> Student[]` (for export),
`searchStudents(query, limit)`, `getStudent(id)`, `createStudent(input)`, `updateStudent(id, input)`,
`deleteStudent(id)`, `deleteStudents(ids) -> count`. Validation: registration number 6–12 digits and
unique; email valid and unique; filière/niveau/groupe must exist in settings.

## Absences

`listAbsences(filters) -> Paged<AbsenceRow>`, `listAllAbsences(filters) -> AbsenceRow[]` (export),
`getAbsence(id)`, `createAbsence(input) -> AbsenceRow` (manual; reuses/creates the matching session),
`setAbsenceStatus(id, status, note?)` (refuses to override a pending certificate),
`deleteAbsence(id)`, `bulkAbsences(ids, op)` where `op` is `{kind:"status", status, note?}` or
`{kind:"delete"}` — pending-certificate rows are skipped by bulk status changes. `AbsenceRow` joins the
absence with its student, session, subject, teacher and certificate.

## Certificates

`listCertificates(filters) -> Paged<CertificateRow>`, `getCertificate(id)`,
`uploadCertificate(input) -> CertificateRow` (sets covered absences to `pending`),
`reviewCertificate(id, "accepted"|"rejected", note?)` (rejection requires a note; propagates status to
absences), `deleteCertificate(id)`. The demo stores small files as data URLs; a real backend stores the
file and returns a URL — the UI only needs `fileName`, `fileType`, `fileSize`, and a URL to preview.

## At-risk engine, notices

`listAtRisk({academicYear, query?, filiere?, niveau?, groupe?}) -> RiskRow[]`. A student is at risk when
unjustified (incl. rejected) absences reach `subjectThreshold` in one subject OR `overallThreshold`
overall, within the academic year. `buildWarningNotice(studentId, academicYear) -> WarningNotice`
returns everything the notice needs (the UI formats and prints it). `logNoticeGenerated(studentIds)`
records an audit entry.

## Dashboard & reports

`adminStats(academicYear) -> AdminStats`, `listAcademicYears() -> number[]`,
`runReport(filters) -> ReportResult` (totals, status breakdown, by month/subject/group, top students).
`MONTH_LABELS` and `academicYearOf(date, startMonth)` are helpers; keep month indexing relative to
`academicYearStartMonth`.

## Audit log

`listAudit(filters) -> Paged<AuditEntry>`. The demo writes an audit entry inside every mutation. A real
backend should do the same server-side (the client can't be trusted to log). Keep `AuditEntry` shape so
the Journal page renders unchanged.

## CSV import (preview then commit)

`previewStudentImport(records) -> ImportPreview<StudentInput>` and `commitStudentImport(rows) -> count`;
`previewAbsenceImport(records) -> ImportPreview<AbsenceImportData>` and `commitAbsenceImport(rows) ->
count`. The UI parses the CSV to `records` (header-keyed objects) client-side, calls preview to validate
each row (marking errors and duplicates), shows the result, and on confirm sends the rows back to commit.
A backend can keep this two-step shape or validate server-side — the preview types are the contract.

## Types

All shapes live in `src/types.ts` (entities, `Paged<T>`, `Settings`, `RiskRow`, read models) and a few
result types in `src/api/index.ts` (`AdminStats`, `ReportResult`, `WarningNotice`, `ImportPreview`,
input interfaces). Import from there; don't redefine.
