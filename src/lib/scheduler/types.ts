export type RoomType = "CLASSROOM" | "LECTURE" | "LAB" | "SEMINAR" | "AUDITORIUM";
export type SessionKind = "LECTURE" | "LAB" | "TUTORIAL";
export type RoomSelection = "AUTO" | "FIXED" | "ALLOWED_ROOMS";

export interface SlotRef {
  order: number;
  kind: "CLASS" | "BREAK";
  start: string; // "09:00"
  end: string;   // "09:50"
  label: string;
}

export interface RoomRef {
  id: string;
  code: string;
  block: string;
  capacity: number;
  type: RoomType;
  capabilities: string[];
}

export interface FacultyRef {
  id: string;
  facultyId: string;
  name: string;
  maxHoursPerWeek: number;
  maxHoursPerDay: number;
  unavailability: { day: number; slotOrder: number }[];
}

export interface SectionRef {
  id: string;
  number: string;
  strength: number;
  homeRoom?: string;
}

/** The room rules attached to an assignment, shared by solver and validator. */
export interface RoomRequirement {
  roomSelection: RoomSelection;
  fixedRoom?: string;
  allowedRooms: string[];
  requiredRoomType?: RoomType;
  requiredCapabilities: string[];
}

/** An assignment as the scheduler sees it. */
export interface AssignmentRef extends RoomRequirement {
  id: string;
  sectionId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  facultyId: string;
  facultyName: string;
  sectionNumber: string;
  kind: SessionKind;
  duration: number;
  /** Exact semester total. Authoritative. */
  requiredSessions: number;
  /** Non-binding weekly hint. Never overrides requiredSessions. */
  targetWeeklyFrequency?: number | null;
}

/** One atomic cell the pattern solver must place. */
export interface Session extends RoomRequirement {
  key: string;            // assignmentId#occurrenceIndex
  assignmentId: string;
  sectionId: string;
  subjectId: string;
  subjectCode: string;
  facultyId: string;
  kind: SessionKind;
  duration: number;
  occurrence: number;
}

export interface Placement {
  day: number;
  slotOrder: number;
  duration: number;
  roomId: string;
}

/** A confirmed teaching day on the semester calendar. */
export interface TeachingDay {
  /** ISO yyyy-mm-dd. */
  date: string;
  /** Actual weekday of the date (0=Sun…6=Sat). */
  weekday: number;
  /** Weekday whose pattern this date follows — differs on a SPECIAL_WORKING day. */
  patternWeekday: number;
  /** 1-based teaching week index, for tail-distribution scoring. */
  week: number;
}

export interface SchedulerRules {
  maxHoursPerDayPerSection: number;
  maxConsecutiveHoursPerFaculty: number;
  allowSessionsAcrossBreak: boolean;
  maxSessionsPerAssignmentPerDay: number;
  preferAfternoonBreak: boolean;
  afternoonWindowStart: string;
  afternoonWindowEnd: string;
  weights: {
    sectionBalance: number;
    facultyBalance: number;
    afternoonBreak: number;
    subjectSpacing: number;
    consecutive: number;
    gaps: number;
    tailDistribution: number;
    roomFit: number;
  };
}

export interface SolverInput {
  days: number[];
  slots: SlotRef[];
  rooms: RoomRef[];
  faculty: FacultyRef[];
  sections: SectionRef[];
  sessions: Session[];
  rules: SchedulerRules;
  seed?: number;
  /**
   * Pattern cells the admin pinned — treated as immovable occupancy. Carrying
   * the assignment and subject means a pinned cell still counts towards the
   * per-day assignment cap and subject-spacing preferences.
   */
  locked?: (Placement & {
    sessionKey: string;
    sectionId: string;
    facultyId: string;
    assignmentId?: string;
    subjectId?: string;
  })[];
}

export interface SolverResult {
  placements: Record<string, Placement>;
  unplaced: { key: string; label: string; reason: string }[];
  stats: { requested: number; placed: number; steps: number; durationMs: number };
}

/** A dated session, before it becomes a Mongoose subdocument. */
export interface DatedSession {
  assignmentId?: string;
  date: string;
  day: number;
  slotOrder: number;
  duration: number;
  sectionId: string;
  subjectId: string;
  facultyId: string;
  roomId: string;
  kind: SessionKind;
  type: "REGULAR" | "EXTRA";
  locked: boolean;
  reason?: string;
}

export interface Violation {
  rule: string;
  severity: "HARD" | "SOFT";
  message: string;
  date?: string;
  slotOrder?: number;
  refs?: string[];
}

export interface AuditReport {
  hardViolations: Violation[];
  softViolations: Violation[];
  countMismatches: { assignment: string; required: number; scheduled: number }[];
  publishable: boolean;
}

export interface ScoreReport {
  total: number;
  breakdown: Record<string, number>;
  warnings: string[];
}
