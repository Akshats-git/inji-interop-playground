import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Tone = "primary" | "quiet" | "danger";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; busy?: boolean }
>(function Button({ tone = "quiet", busy, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition-[background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
        tone === "primary" && "bg-issue text-on-issue shadow-card hover:-translate-y-px hover:shadow-lift",
        tone === "quiet" && "border border-hairline bg-surface text-issue hover:border-issue hover:bg-issue-soft",
        tone === "danger" && "border border-fail/40 bg-surface text-fail hover:bg-fail-soft",
        className,
      )}
      {...rest}
    >
      {busy && (
        <span
          className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  id,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (id: string) => ReactNode;
  id?: string;
}) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={fid} className="text-sm font-bold">
        {label}
      </label>
      {children(fid)}
      {error ? (
        <p className="text-sm text-fail" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const control =
  "min-h-11 w-full rounded-[10px] border border-hairline bg-surface px-3.5 text-base text-ink placeholder:text-muted/70 hover:border-muted focus:border-issue focus:shadow-[0_0_0_3px_var(--issue-soft)]";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(control, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx(
        control,
        "appearance-none bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-8",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%235a6478' stroke-width='1.6'/%3E%3C/svg%3E\")",
      }}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(control, "min-h-28 py-2 font-mono text-sm", props.className)} />;
}

/** A choice rendered as a selectable row with a description (radio semantics). */
export function Choice<T extends string>({
  name,
  value,
  current,
  onChange,
  title,
  note,
  disabled,
  accent,
}: {
  name: string;
  value: T;
  current: T;
  onChange: (v: T) => void;
  title: string;
  note?: string;
  disabled?: boolean;
  accent?: "issue" | "present";
}) {
  const on = current === value;
  return (
    <label
      className={cx(
        "flex cursor-pointer gap-3 rounded-xl border px-3.5 py-3 transition-[border-color,background-color,box-shadow] duration-150",
        on
          ? accent === "present"
            ? "border-present bg-present-soft"
            : "border-issue bg-issue-soft"
          : "border-hairline bg-surface hover:border-muted hover:shadow-card",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        className="mt-1 accent-[var(--issue)]"
        name={name}
        value={value}
        checked={on}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      <span className="flex flex-col">
        <span className="font-bold">{title}</span>
        {note && <span className="text-sm text-muted">{note}</span>}
      </span>
    </label>
  );
}

export type Mark = "pass" | "fail" | "running" | "waiting" | "pending" | "skipped" | "warn";

const MARK: Record<Mark, { cls: string; glyph: string }> = {
  pass: { cls: "bg-pass-soft text-pass", glyph: "✓" },
  fail: { cls: "bg-fail-soft text-fail", glyph: "✕" },
  running: { cls: "bg-issue-soft text-issue", glyph: "•" },
  waiting: { cls: "bg-present-soft text-present-ink", glyph: "…" },
  pending: { cls: "bg-sunken text-muted", glyph: "○" },
  skipped: { cls: "bg-sunken text-muted", glyph: "–" },
  warn: { cls: "bg-present-soft text-present-ink", glyph: "!" },
};

export function StatusMark({
  mark,
  children,
  className,
}: {
  mark: Mark;
  children: ReactNode;
  className?: string;
}) {
  const m = MARK[mark];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-bold whitespace-nowrap",
        m.cls,
        className,
      )}
    >
      <span aria-hidden>{m.glyph}</span>
      {children}
    </span>
  );
}

export function Tag({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "plain" | "issue" | "present";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-px text-xs font-semibold whitespace-nowrap",
        tone === "plain" && "bg-sunken text-muted",
        tone === "issue" && "bg-issue-soft text-issue",
        tone === "present" && "bg-present-soft text-present-ink",
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx("rounded-2xl border border-hairline bg-surface shadow-card", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
          {title && <h2 className="text-base">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "warn";
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "rounded-xl border-l-4 px-4 py-2.5 text-sm",
        tone === "info" && "border-issue bg-issue-soft",
        tone === "error" && "border-fail bg-fail-soft",
        tone === "warn" && "border-present bg-present-soft",
      )}
    >
      {children}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-hairline px-5 py-7">
      <p className="font-bold">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, lede, action }: { title: string; lede?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[68ch]">
        <h1 className="text-3xl sm:text-4xl">
          <span className="scribble">{title}</span>
        </h1>
        {lede && <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted">{lede}</p>}
      </div>
      {action}
    </div>
  );
}
