export type RoomType = "LECTURE" | "LAB" | "SEMINAR" | "AUDITORIUM";
export type SessionKind = "LECTURE" | "LAB" | "TUTORIAL";

export interface SlotRef {
  order: number;
  kind: "CLASS" | "BREAK";
  start: string;
  end: string;
  label: string;
}

export interface RoomRef {
  id: string;
  code: string;
  block: string;
  capacity: number;
  type: RoomType;
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

/** One atomic thing the solver must place. */
export interface Session {
  key: string;            // assignmentId#occurrenceIndex
  assignmentId: string;
  sectionId: string;
  subjectId: string;
  subjectCode: string;
  facultyId: string;
  kind: SessionKind;
  duration: number;
  requiredRoomType?: RoomType;
  fixedRoom?: string;
  occurrence: number;
}

export interface Placement {
  day: number;
  slotOrder: number;
  duration: number;
  roomId: string;
}

export interface SolverInput {
  days: number[];
  slots: SlotRef[];
  rooms: RoomRef[];
  faculty: FacultyRef[];
  sections: SectionRef[];
  sessions: Session[];
  rules: {
    maxHoursPerDayPerSection: number;
    maxConsecutiveHoursPerFaculty: number;
    allowSessionsAcrossBreak: boolean;
  };
  seed?: number;
  /** Placements the admin pinned — treated as immovable occupancy. */
  locked?: (Placement & { sessionKey: string; sectionId: string; facultyId: string })[];
}

export interface SolverResult {
  placements: Record<string, Placement>;
  unplaced: { key: string; label: string; reason: string }[];
  stats: { requested: number; placed: number; steps: number; durationMs: number };
}
