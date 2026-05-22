/**
 * Tiny inline spinner used inside buttons, on the initial dashboard load, and
 * anywhere else we need to convey "something is happening".
 *
 * Inherits `currentColor`, so place it inside a parent with the right text
 * colour (e.g. white inside a `bg-brand-600` button, danger inside a danger
 * button). Defaults to size "sm" which lines up nicely with button text.
 *
 * Usage:
 *   <Spinner />                         // inline in a button
 *   <Spinner size="md" />               // a bit larger for dialog headers
 *   <Spinner size="lg" className="text-brand-600" />  // page-level loader
 */
type SpinnerProps = {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  label?: string;
};

const SIZE_CLASSES: Record<NonNullable<SpinnerProps["size"]>, string> = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-8 w-8",
};

export function Spinner({
  size = "sm",
  className = "",
  label,
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
      className="inline-flex items-center gap-2"
    >
      <svg
        className={`animate-spin ${SIZE_CLASSES[size]} ${className}`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      {label ? <span>{label}</span> : null}
    </span>
  );
}
