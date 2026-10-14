// Fixed lists and participant-facing wording.
// Copy rules: plain language, no contractions, no em dashes, Australian spelling.

export const STAGES = ["arrival", "poll", "problems", "shortlist", "golden", "next_steps", "done"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_INFO: Record<Stage, { label: string; path: string; short: string }> = {
  arrival: { label: "Welcome", short: "Welcome", path: "welcome" },
  poll: { label: "Warm-up poll", short: "Poll", path: "poll" },
  problems: { label: "Messy data problems", short: "Problems", path: "problems" },
  shortlist: { label: "Shortlist to three", short: "Shortlist", path: "shortlist" },
  golden: { label: "Golden use case", short: "Golden", path: "golden" },
  next_steps: { label: "Next steps", short: "Next steps", path: "next" },
  done: { label: "Thank you", short: "Done", path: "done" },
};

export const PROBLEM_TYPES = [
  "paperwork_compliance",
  "lab_data_spreadsheets",
  "unused_data",
  "slow_manual_processing",
  "too_slow_to_use",
  "hard_to_explain",
  "predict_not_react",
  "systems_do_not_talk",
] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];

// The discovery guide shown beside the problem cards on P4.
export const PROBLEM_TYPE_INFO: Record<ProblemType, { label: string; prompt: string }> = {
  paperwork_compliance: {
    label: "Paperwork and compliance",
    prompt: "We spend hours filling in, checking or chasing forms, batch records or regulatory documents.",
  },
  lab_data_spreadsheets: {
    label: "Lab data in spreadsheets",
    prompt: "Results live in spreadsheets that people copy, paste and match up by hand.",
  },
  unused_data: {
    label: "Data we collect but never use",
    prompt: "We keep years of data, but nobody has the time to look at it.",
  },
  slow_manual_processing: {
    label: "Slow manual processing",
    prompt: "Someone retypes, reformats or checks the same information every week.",
  },
  too_slow_to_use: {
    label: "Answers arrive too late",
    prompt: "By the time the report is ready, the decision has already been made.",
  },
  hard_to_explain: {
    label: "Hard to explain to others",
    prompt: "We struggle to show investors, regulators or partners what our data says.",
  },
  predict_not_react: {
    label: "Predict, not react",
    prompt: "We only find out about failures, delays or stock shortages after they happen.",
  },
  systems_do_not_talk: {
    label: "Systems do not talk",
    prompt: "Our lab system, finance system and spreadsheets do not share information.",
  },
};

export const FIX_TYPES = ["prediction", "clean_and_join", "dashboard", "document_automation"] as const;
export type FixType = (typeof FIX_TYPES)[number];
export const FIX_TYPE_LABELS: Record<FixType, string> = {
  prediction: "Prediction",
  clean_and_join: "Clean and join data",
  dashboard: "Dashboard",
  document_automation: "Document automation",
};

export const SECTORS = [
  "Therapeutics and drug discovery",
  "MedTech and devices",
  "Diagnostics",
  "Digital health",
  "Contract research (CRO)",
  "Contract manufacturing (CDMO)",
  "Research institute or university",
  "Professional services",
  "Software and data",
  "Other",
] as const;

export const SIZE_BANDS = ["1-19", "20-49", "50-199", "200+"] as const;
export type SizeBand = (typeof SIZE_BANDS)[number];
export const SIZE_BAND_LABELS: Record<SizeBand, string> = {
  "1-19": "1 to 19",
  "20-49": "20 to 49",
  "50-199": "50 to 199",
  "200+": "200 or more",
};

export const STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT", "Outside Australia"] as const;

export const FREQUENCIES = ["Every day", "Every week", "Every month", "A few times a year"] as const;

export const DATA_READY_LABELS: Record<number, string> = {
  1: "Scattered or on paper",
  2: "In a few places",
  3: "In one place, but messy",
  4: "Mostly clean",
  5: "Clean and in one system",
};

export const VALUE_LABELS: Record<number, string> = {
  1: "Nice to have",
  2: "Small saving",
  3: "Worth doing",
  4: "Big saving",
  5: "Changes how we work",
};

export const NEXT_CHOICES = ["followup", "funding", "plan_only", "not_now"] as const;
export type NextChoice = (typeof NEXT_CHOICES)[number];
export const NEXT_CHOICE_LABELS: Record<NextChoice, { label: string; hint: string }> = {
  followup: { label: "Book a follow-up with ARM Hub", hint: "We will contact you to talk through your plan." },
  // Neutral on purpose: eligibility for programs such as AI Adopt depends on size and
  // ownership, which staff confirm before naming a program.
  funding: { label: "Explore funding options", hint: "We will look at grants and co-funding that could suit your project." },
  plan_only: { label: "Just send me the plan", hint: "You will get your AI starter plan by email." },
  not_now: { label: "Not right now", hint: "You will still get your plan. We will not follow up." },
};
export const CHOICES_NEEDING_CONSENT: NextChoice[] = ["followup", "funding"];

export const START_TIMINGS = ["Within 1 month", "1 to 3 months", "3 to 6 months", "Not sure yet"] as const;

// The exact consent wording. It is stored with each consent so we can show what was agreed to.
export const CONSENT_TEXT =
  "Yes, ARM Hub may contact me about my AI starter plan, funding options and related ARM Hub programs. I can unsubscribe at any time.";

export const GOLDEN_CHECKS = [
  { key: "check_mvp", label: "Small enough to build a first version in 8 to 12 weeks" },
  { key: "check_collab", label: "The people who do this work today will help shape it" },
  { key: "check_metric", label: "We can measure whether it worked" },
  { key: "check_data", label: "We know where the data is and can share a sample" },
] as const;

export const APPROVAL_LEVELS = [
  "I can approve it",
  "My manager can approve it",
  "Needs the CEO or board",
  "Not sure yet",
] as const;

export const LEAD_RATINGS = ["hot", "warm", "cold"] as const;
export type LeadRating = (typeof LEAD_RATINGS)[number];

export const PLAN_STATUSES = ["draft_received", "in_review", "ready", "sent", "opened"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];
export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  draft_received: "Draft received",
  in_review: "In review",
  ready: "Ready",
  sent: "Sent",
  opened: "Opened",
};

// Default warm-up poll for a new event. Admin can edit these in event setup.
export const DEFAULT_POLL: { text: string; type: "single" | "scale"; options: string[] }[] = [
  {
    text: "How does your team use AI today?",
    type: "single",
    options: ["Not at all", "Trying free tools", "Some regular use", "Built into our work"],
  },
  { text: "How ready is your data for AI?", type: "scale", options: ["1", "2", "3", "4", "5"] },
  {
    text: "Where does most of your data live?",
    type: "single",
    options: ["Spreadsheets", "Lab systems", "Paper", "Cloud apps", "A mix of all of these"],
  },
  {
    text: "What worries you most about AI?",
    type: "single",
    options: ["Cost", "Data privacy", "Skills in the team", "Accuracy", "Knowing where to start"],
  },
];

// Event slugs cannot clash with the app's own top-level pages.
export const RESERVED_SLUGS = ["console", "plan", "privacy", "api", "_next", "favicon.ico"];

// Imported people with no company get their own placeholder organisation with this name prefix.
export const PLACEHOLDER_PREFIX = "Organisation to confirm: ";
