// Row shapes as they come back from the database.
import type { Stage } from "./copy";
import type { ScoreWeights } from "./rules";

export type EventRow = {
  id: string;
  slug: string;
  name: string;
  venue: string | null;
  starts_at: Date | null;
  access_opens_at: Date | null;
  access_closes_at: Date | null;
  plans_due_date: string | Date | null;
  current_stage: Stage;
  timer_ends_at: Date | null;
  timer_paused_remaining_s: number | null;
  poll_open: boolean;
  ai_enabled: boolean;
  score_weights: ScoreWeights;
  stuck_threshold_min: number;
  status: "setup" | "live" | "closed";
  booking_url: string | null;
};

export type TableRow = {
  id: string;
  event_id: string;
  number: number;
  table_token: string;
  facilitator_id: string | null;
};

export type CompanyRow = {
  id: string;
  event_id: string;
  table_id: string | null;
  name: string;
  website: string | null;
  sector: string | null;
  size_band: string | null;
  state: string | null;
  is_walk_in: boolean;
  is_locked: boolean;
  flags: Record<string, unknown>;
  hubspot_company_id: string | null;
  hubspot_note_id: string | null;
  hubspot_task_id: string | null;
  golden_problem_id: string | null;
  shortlist_confirmed_at: Date | null;
  last_activity_at: Date | null;
};

export type PersonRow = {
  id: string;
  company_id: string;
  name: string;
  role: string | null;
  email: string | null;
  is_walk_in: boolean;
  marketing_consent: boolean;
  consent_text: string | null;
  consent_at: Date | null;
  hubspot_contact_id: string | null;
};

export type ProblemRow = {
  id: string;
  company_id: string;
  position: number;
  title: string;
  today_state: string | null;
  future_state: string | null;
  type: string | null;
  affected_role: string | null;
  frequency: string | null;
  data_ready: number | null;
  value: number | null;
  fix_type: string | null;
  builds_foundation: boolean;
  score: number;
  shortlisted: boolean;
  shortlist_overridden: boolean;
  deleted_at: Date | null;
  updated_at: Date;
};

export type GoldenDraftRow = {
  id: string;
  company_id: string;
  problem_id: string;
  first_project: string | null;
  metric: string | null;
  baseline: string | null;
  target: string | null;
  data_location: string | null;
  sample_access: string | null;
  approval_level: string | null;
  owner: string | null;
  check_mvp: boolean;
  check_collab: boolean;
  check_metric: boolean;
  check_data: boolean;
  saved_at: Date | null;
};

export type NextStepsRow = {
  id: string;
  company_id: string;
  choice: string | null;
  start_timing: string | null;
  extra_contact: string | null;
  submitted_by: string | null;
  submitted_at: Date | null;
};

export type PollQuestionRow = {
  id: string;
  event_id: string;
  position: number;
  text: string;
  options: string[];
  type: "single" | "scale";
};

export type StaffRow = { id: string; email: string; name: string; role: "admin" | "facilitator" };

export type FacilitatorNotesRow = {
  id: string;
  company_id: string;
  decision_maker: string | null;
  lead_rating: string | null;
  funding_fit: string | null;
  signals: string | null;
  notes: string | null;
  next_action: string | null;
  action_owner: string | null;
  action_due: string | Date | null;
  updated_by: string | null;
  updated_at: Date;
};

export type FinalPlanRow = {
  id: string;
  company_id: string;
  version: number;
  status: "draft_received" | "in_review" | "ready" | "sent" | "opened";
  title: string | null;
  first_project: string | null;
  metric: string | null;
  baseline: string | null;
  target: string | null;
  recommendation: string | null;
  risks: string | null;
  pdf_path: string | null;
  sent_at: Date | null;
  opened_at: Date | null;
  author_id: string | null;
  updated_at: Date;
};
