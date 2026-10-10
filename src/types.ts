// Domain model for UniAbsence.
// Every entity has a string id. Dates are ISO "YYYY-MM-DD", timestamps are ISO datetime strings.

export type Role = "admin" | "teacher" | "student";

export type UserStatus = "active" | "disabled";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  firstName: string;
  lastName: string;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface Student {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  registrationNumber: string;
  email: string;
  filiere: string;
  niveau: string;
  groupe: string;
  createdAt: string;
}

export interface Teacher {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  title: string; // "Dr.", "Pr.", "M.", "Mme"
  email: string;
  subjectIds: string[];
  createdAt: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
}

/** A class session for one group, taught by one teacher. Absences hang off sessions. */
export interface Session {
  id: string;
  subjectId: string;
  teacherId: string;
  date: string;
  startTime: string; // "08:30"
  endTime: string; // "10:00"
  filiere: string;
  niveau: string;
  groupe: string;
  createdAt: string;
}

export type AbsenceStatus = "unjustified" | "pending" | "justified" | "rejected";

export interface Absence {
  id: string;
  studentId: string;
  sessionId: string;
  status: AbsenceStatus;
  certificateId?: string;
  note?: string; // admin note (e.g. reason for refusal, or manual justification)
  createdAt: string;
  updatedAt: string;
}

export type CertificateStatus = "pending" | "accepted" | "rejected";

export interface Certificate {
  id: string;
  studentId: string;
  absenceIds: string[];
  fileName: string;
  fileType: string;
  fileSize: number;
  /** data: URL of the file when small enough to keep in local storage; undefined otherwise. */
  dataUrl?: string;
  startDate: string;
  endDate: string;
  status: CertificateStatus;
  uploadedByUserId: string;
  uploadedAt: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export type ActivityKind =
  | "student_created"
  | "student_updated"
  | "student_deleted"
  | "teacher_created"
  | "teacher_updated"
  | "teacher_deleted"
  | "teacher_status"
  | "subject_created"
  | "session_saved"
  | "absence_created"
  | "absence_updated"
  | "absence_deleted"
  | "certificate_uploaded"
  | "certificate_accepted"
  | "certificate_rejected"
  | "password_changed";

export interface Activity {
  id: string;
  kind: ActivityKind;
  message: string;
  actorUserId: string;
  /** Who the activity is about, so students/teachers can see their own feed. */
  subjectUserIds: string[];
  at: string;
}

export interface Database {
  version: number;
  users: User[];
  students: Student[];
  teachers: Teacher[];
  subjects: Subject[];
  sessions: Session[];
  absences: Absence[];
  certificates: Certificate[];
  activities: Activity[];
}

/** Read models returned by the API: rows joined with the names the UI needs. */
export interface AbsenceRow {
  absence: Absence;
  student: Student;
  session: Session;
  subject: Subject;
  teacher: Teacher | undefined;
  certificate: Certificate | undefined;
}

export interface SessionRow {
  session: Session;
  subject: Subject;
  teacher: Teacher | undefined;
  absentCount: number;
  studentCount: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AuthSession {
  user: User;
  student?: Student;
  teacher?: Teacher;
}

export const ABSENCE_STATUS_LABEL: Record<AbsenceStatus, string> = {
  unjustified: "Non justifiée",
  pending: "En attente",
  justified: "Justifiée",
  rejected: "Refusée",
};

export const CERTIFICATE_STATUS_LABEL: Record<CertificateStatus, string> = {
  pending: "En attente",
  accepted: "Accepté",
  rejected: "Refusé",
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrateur",
  teacher: "Enseignant",
  student: "Étudiant",
};

/** Number of unjustified absences in one subject from which a student is flagged. */
export const UNJUSTIFIED_WARNING_THRESHOLD = 3;

/** Business rule: max certificate size accepted. */
export const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;
/** Storage constraint of this local version: previews are kept only under this size. */
export const MAX_PREVIEW_BYTES = 1.5 * 1024 * 1024;
export const ACCEPTED_CERTIFICATE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
