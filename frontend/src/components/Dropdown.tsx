import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type DropdownProps = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  small?: boolean;
  /** Shown as a hint and not interactive until its parent filter is chosen. */
  disabled?: boolean;
};

export function Dropdown({
  options,
  value,
  onChange,
  className = "",
  small,
  disabled = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        aria-disabled={disabled || undefined}
        title={value}
        className={`flex h-full w-full items-center justify-between gap-2 rounded-[10px] bg-surface ${
          disabled || small ? "px-3 text-[14px]" : "px-4 text-[16px]"
        } ${disabled ? "cursor-not-allowed text-ink-faint" : "cursor-pointer text-ink"}`}
      >
        <span className="truncate">{value}</span>
        <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.5} />
      </button>
      {open && !disabled && (
        <ul className="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-[10px] bg-surface py-1 shadow-[var(--shadow-soft)]">
          {options.map((o) => (
            <li key={o}>
              <button
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
                className={`block w-full cursor-pointer whitespace-nowrap px-4 py-2 text-left text-[15px] hover:bg-canvas ${
                  o === value ? "text-ink" : "text-ink-soft"
                }`}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
