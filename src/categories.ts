export const VALID_CATEGORIES = [
  "order_status",
  "proof_change",
  "artwork_issue",
  "quality_complaint",
  "billing",
  "other",
] as const;

export type Category = (typeof VALID_CATEGORIES)[number];

export function isValidCategory(value: string): value is Category {
  return (VALID_CATEGORIES as readonly string[]).includes(value);
}
