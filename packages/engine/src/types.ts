/** The authoring workflows the HyperFrames skill router can enter. */
export const WORKFLOWS = [
  "product-launch-video",
  "faceless-explainer",
  "motion-graphics",
  "music-to-video",
  "general-video",
  "slideshow",
] as const;
export type Workflow = (typeof WORKFLOWS)[number];

export const ASPECTS = {
  "9:16": { width: 1080, height: 1920, resolution: "portrait" },
  "16:9": { width: 1920, height: 1080, resolution: "landscape" },
  "1:1": { width: 1080, height: 1080, resolution: "square" },
} as const;
export type Aspect = keyof typeof ASPECTS;

/** What the user asked for. Everything the pipeline needs to start. */
export type VideoSpec = {
  prompt: string;
  workflow: Workflow;
  aspect: Aspect;
  /** Target length in seconds. */
  seconds: number;
  destination: string;
  language: string;
  narration: boolean;
  captions: boolean;
  music: boolean;
  audience?: string;
  /** Optional source URL the workflow should capture or read. */
  sourceUrl?: string;
  /** Ask before deciding, and pause at review gates. */
  interactive?: boolean;
};

export type JobStatus =
  | "queued"
  | "running"
  /** Parked on an unanswered question so the worker can take the next job. */
  | "awaiting-input"
  | "succeeded"
  | "failed"
  | "cancelled"
  /** Not produced by this platform — an existing project adopted into the gallery. */
  | "imported";

/** One choice the agent offers for a decision. */
export type InteractionOption = {
  label: string;
  description?: string;
  preview?: string;
};

export type InteractionQuestion = {
  question: string;
  header: string;
  multiSelect?: boolean;
  options: InteractionOption[];
};

/**
 * A point where the run has stopped and is waiting on a person: either the
 * agent asking a question, or a fixed review gate between stages.
 */
export type Interaction = {
  id: string;
  kind: "question" | "checkpoint";
  askedAt: string;
  /** kind === "question" */
  questions?: InteractionQuestion[];
  /** kind === "checkpoint" */
  stage?: string;
  summary?: string;
  /** Repo-relative path of the artifact under review. */
  artifact?: string;
  /** Frame stills to review, captured for the pre-render gate. */
  storyboard?: StoryboardManifest;
};

/** One timed element on a composition's timeline, read from index.html. */
export type Clip = {
  id: string;
  /** Sub-composition file, when the clip is a frame. */
  src?: string;
  start: number;
  duration: number;
};

/** One frame of a captured storyboard. */
export type StoryboardFrame = {
  clipId: string;
  src?: string;
  start: number;
  duration: number;
  /** Timestamp the still was captured at. */
  at: number;
  /** Project-relative path of the PNG. */
  image?: string;
};

export type StoryboardManifest = {
  capturedAt: string;
  capturedAtMs: number;
  frames: StoryboardFrame[];
};

/** A change requested against a finished render, optionally at a timestamp. */
export type RevisionNote = {
  id: string;
  createdAt: string;
  /** Seconds into the video. Absent for a note about the whole piece. */
  timeSec?: number;
  /** The frame on screen at `timeSec`, resolved when the note was made. */
  clipId?: string;
  text: string;
};

export type InteractionAnswer = {
  id: string;
  answeredAt: string;
  /** kind === "question": one entry per question, in order. */
  answers?: string[];
  /** kind === "checkpoint" */
  decision?: "approve" | "revise";
  notes?: string;
};

/**
 * Pipeline stages, in order. Progress is derived from the project directory
 * rather than from what the agent says it did, so it cannot drift.
 */
export const STAGES = [
  "scaffold",
  "brief",
  "script",
  "storyboard",
  "frames",
  "media",
  "check",
  "render",
] as const;
export type Stage = (typeof STAGES)[number];

export type StageState = {
  stage: Stage;
  status: "pending" | "active" | "done";
  /** Human-readable detail, e.g. "4/7 frames". */
  detail?: string;
};

export type JobEvent = {
  at: string;
  kind: "log" | "tool" | "stage" | "error" | "usage" | "ask" | "answer" | "steer";
  message: string;
  data?: Record<string, unknown>;
};

export type Job = {
  id: string;
  slug: string;
  status: JobStatus;
  spec: VideoSpec;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** Path relative to the repo root. */
  projectDir: string;
  /** Path relative to the repo root, once a render exists. */
  videoPath?: string;
  stages: StageState[];
  error?: string;
  costUsd?: number;
  numTurns?: number;
  sessionId?: string;
  /**
   * Continue an existing project directory instead of scaffolding a new one.
   * Set when a job is re-queued to salvage the work a failed run left behind.
   */
  resume?: boolean;
  /** Id of the job this one continues, for the history trail. */
  resumeOf?: string;
  /** Let the agent ask questions and pause at review gates. */
  interactive?: boolean;
  /** Job this one revises. */
  revisionOf?: string;
  /** 1 for the first render, 2 for the first revision, and so on. */
  version?: number;
  /** Change requests collected against this job's render. */
  notes?: RevisionNote[];
  /** The notes this run was asked to act on. */
  appliedNotes?: RevisionNote[];
  /** The decision currently blocking the run, if any. */
  pending?: Interaction;
  /** Answers already given, replayed into a resumed run so nothing is re-asked. */
  answered?: { interaction: Interaction; answer: InteractionAnswer }[];
};
