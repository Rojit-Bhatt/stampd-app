export type PasswordStrength = "weak" | "medium" | "strong";

export const STRENGTH_LEVELS: PasswordStrength[] = ["weak", "medium", "strong"];

/**
 * Rough client-side strength signal for the meter — not a security
 * boundary. The only enforced rule is the backend's 8-character minimum;
 * this is feedback while typing, nothing more.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < 8) return "weak";
  const varietyCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  if (password.length >= 12 && varietyCount >= 3) return "strong";
  if (password.length >= 8 && varietyCount >= 2) return "medium";
  return "weak";
}

export function strengthColor(strength: PasswordStrength): string {
  if (strength === "strong") return "bg-emerald-500";
  if (strength === "medium") return "bg-amber-500";
  return "bg-red-500";
}
