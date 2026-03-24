// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for skill categories and roles.
// Used identically in: Profile, ProfileSetup, Feed (collabs), Discover.
// ─────────────────────────────────────────────────────────────────────────────

/** 8 broad, non-overlapping skill categories shown everywhere. */
export const SKILL_CATEGORIES = [
  "Engineering",
  "Design",
  "Product",
  "Marketing",
  "Content",
  "Data & AI",
  "Business",
  "Community",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/** Collab browse filters — All + every category. */
export const COLLAB_FILTERS = ["All", ...SKILL_CATEGORIES] as const;

/** Role options — max 2 selections per user. */
export const ROLE_OPTIONS = [
  "Founder",
  "Co-founder",
  "Builder",
  "Investor",
  "Creator",
] as const;

export type RoleOption = (typeof ROLE_OPTIONS)[number];

export const MAX_ROLES = 2;
