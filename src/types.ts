// Domain model for UniAbsence (administration platform).
// Every entity has a string id. Dates are ISO "YYYY-MM-DD", timestamps are ISO datetime strings.

/** Admin privilege level. super-admin can manage admin accounts and settings; staff cannot. */
export type AdminRole = "super-admin" | "staff";
export type UserStatus = "active" | "disabled";

export interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  firstName: string;
  lastName: string;
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface Student {
  id: string;
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
  note?: string;
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

/** Append-only audit trail: who did what, when. */
export type AuditAction =
  | "login"
  | "admin_created" | "admin_updated" | "admin_status" | "admin_deleted" | "password_changed" | "password_reset"
  | "student_created" | "student_updated" | "student_deleted" | "students_imported"
  | "teacher_created" | "teacher_updated" | "teacher_status" | "teacher_deleted"
  | "subject_created" | "subject_updated" | "subject_deleted"
  | "absence_created" | "absence_updated" | "absence_deleted" | "absences_imported" | "absences_bulk"
  | "certificate_uploaded" | "certificate_reviewed" | "certificate_deleted"
  | "notice_generated"
  | "settings_updated" | "data_reset";

export interface AuditEntry {
  id: string;
  action: AuditAction;
  summary: string;
  actorUserId: string;
  actorName: string;
  /** Entity most affected, for filtering (e.g. "student", "absence"). */
  entity?: string;
  at: string;
}

export interface Settings {
  institutionName: string;
  /** Unjustified absences in one subject at/above which a student is flagged. */
  subjectThreshold: number;
  /** Total unjustified absences across all subjects at/above which a student is flagged. */
  overallThreshold: number;
  filieres: string[];
  niveaux: string[];
  groupes: string[];
  /** Academic year start month (1-12). September = 9. */
  academicYearStartMonth: number;
}

export interface Database {
  version: number;
  settings: Settings;
  admins: AdminUser[];
  students: Student[];
  teachers: Teacher[];
  subjects: Subject[];
  sessions: Session[];
  absences: Absence[];
  certificates: Certificate[];
  audit: AuditEntry[];
}

// Read models returned by the API: rows joined with the names the UI needs.
export interface AbsenceRow {
  absence: Absence;
  student: Student;
  session: Session;
  subject: Subject;
  teacher: Teacher | undefined;
  certificate: Certificate | undefined;
}

export interface CertificateRow {
  certificate: Certificate;
  student: Student;
  absences: AbsenceRow[];
  uploadedBy: AdminUser | undefined;
  reviewedBy: AdminUser | undefined;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AuthSession {
  user: AdminUser;
}

/** One at-risk student with the breakdown that triggered the flag. */
export interface RiskRow {
  student: Student;
  totalUnjustified: number;
  overallFlag: boolean;
  subjects: { subject: Subject; unjustified: number; flag: boolean }[];
  topSubject: { subject: Subject; unjustified: number } | undefined;
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

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  "super-admin": "Super administrateur",
  staff: "Agent de scolarité",
};

export const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 1.5 * 1024 * 1024;
export const ACCEPTED_CERTIFICATE_TYPES = ["application/pdf", "image/jpeg", "image/png"];
