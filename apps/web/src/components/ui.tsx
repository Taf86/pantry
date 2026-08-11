import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";

/** Mattoni comuni. Nessuna astrazione oltre a ciò che si ripete davvero. */

export const Button = ({
  variant = "default",
  size = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger" | "ghost";
  size?: "default" | "small";
}) => (
  <button
    type="button"
    className={[
      "button",
      variant === "default" ? "" : `button--${variant}`,
      size === "small" ? "button--small" : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ")}
    {...props}
  />
);

export const Field = ({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: (props: { id: string; "aria-invalid"?: boolean }) => ReactNode;
}) => {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children(error ? { id, "aria-invalid": true } : { id })}
      {hint !== undefined && <span className="muted">{hint}</span>}
      {error !== undefined && <span className="field__error">{error}</span>}
    </div>
  );
};

export const Card = ({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) => (
  <div className={`card ${className ?? ""}`} style={style}>
    {children}
  </div>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="empty">{children}</p>
);

export const Badge = ({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "accent" | "warning" | "danger";
  children: ReactNode;
}) => (
  <span className={`badge ${tone === "neutral" ? "" : `badge--${tone}`}`}>
    {children}
  </span>
);

/**
 * Modale con focus e tastiera gestiti a mano.
 *
 * `<dialog>` sarebbe più corto, ma il suo comportamento su iOS Safari è ancora
 * irregolare — ed è metà del parco dispositivi di questa app.
 */
export const Modal = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    ref.current
      ?.querySelector<HTMLElement>("input, select, textarea, button")
      ?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{title}</h2>
        <div className="stack" style={{ marginTop: "1rem" }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export const Loading = ({ what }: { what: string }) => (
  <p className="empty" role="status">
    Caricamento {what}…
  </p>
);

export const ErrorState = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) => (
  <div className="empty" role="alert">
    <p>{message}</p>
    {onRetry !== undefined && (
      <Button size="small" onClick={onRetry}>
        Riprova
      </Button>
    )}
  </div>
);
