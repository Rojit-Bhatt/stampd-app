import { type ReactNode } from "react";

// Shared inline-error input wrapper used across every login/register/reset
// form (Task 10 — error-message UX). Follows the WCAG pattern:
//
//   1. The error renders right below the offending field, in red.
//   2. When an error is present the wrapper gets a red border, visually
//      pairing the field with its message.
//   3. The input carries `aria-invalid` and `aria-describedby` pointing at
//      the error node, so screen readers announce it on focus.
//
// Usage with react-hook-form:
//
//   const { register, formState: { errors, touchedFields } } = useForm(...);
//   <ErrorInput label="Email" id="login-email" error={errors.email?.message}
//               touched={!!touchedFields.email} icon={<Mail />}>
//     <input id="login-email" {...register("email")}
//            aria-invalid={!!errors.email}
//            aria-describedby={errors.email ? "login-email-error" : undefined} />
//   </ErrorInput>
//
// Errors are only shown once a field has been touched or the form was
// submitted, so first-time visitors are not greeted with a wall of red.
//
// `mode` selects the design shell because the two shells use different CSS
// tokens: the console runs on the light ink theme (`--err`, `--line`,
// `--ink`, `--primary`), while the dark landing/auth pages use their own
// `--lp-*` palette (red = terracotta `--lp-terra`).

export interface ErrorInputProps {
  label: string;
  id: string;
  error?: string;
  touched?: boolean;
  /** Force the error visible even when untouched (e.g. after submit). */
  forced?: boolean;
  mode?: "console" | "landing";
  icon?: ReactNode;
  /** Extra classes applied to the wrapper div. */
  className?: string;
  children: ReactNode;
}

export function ErrorInput({
  label,
  id,
  error,
  touched = false,
  forced = false,
  mode = "console",
  icon,
  className,
  children,
}: ErrorInputProps) {
  const errorId = `${id}-error`;
  const showError = Boolean(error) && (touched || forced);

  // Both shells: a neutral rest border, a colored focus border, and a red
  // border when the field has an error. Tokens are resolved inline because
  // the two shells have different variable names.
  const restBorder = mode === "landing" ? "var(--lp-line)" : "var(--line)";
  const focusBorder = mode === "landing" ? "var(--lp-green)" : "var(--primary)";
  const errBorder = mode === "landing" ? "var(--lp-terra)" : "var(--err)";

  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-[13px] font-semibold text-[var(--lp-ink)]" data-mode={mode}>
        {label}
      </span>
      <div
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition-colors ${
          showError ? "" : "focus-within:border-[color:var(--lp-green)]"
        } ${className ?? ""}`}
        style={
          showError
            ? { borderColor: errBorder }
            : {
                borderColor: restBorder,
                // focus-within cannot read CSS variables from inline style
                // declarations on the SAME element via class interpolation,
                // so the focused color is set here for both shells.
                ["--lp-green" as string]: focusBorder,
              }
        }
      >
        {icon && <span>{icon}</span>}
        {children}
      </div>
      {showError && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 pl-1 text-xs font-semibold"
          style={{ color: errBorder }}
          aria-live="assertive"
        >
          {error}
        </p>
      )}
    </label>
  );
}
