import { ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DropdownProps = {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  small?: boolean;
  /** Shown as a hint and not interactive until its parent filter is chosen. */
  disabled?: boolean;
  /** When false the list closes (e.g. the mobile menu collapsed). */
  active?: boolean;
};

type MenuPosition = {
  left: number;
  width: number;
  top: number;
  maxHeight: number;
  /** The list sits above the trigger, so it is shifted up by its own height. */
  above: boolean;
};

export function Dropdown({
  options,
  value,
  onChange,
  className = "",
  small,
  disabled = false,
  active = true,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  // A collapsed mobile menu must not leave a portalled list floating.
  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);

  // The list is portalled out of the menu so the menu's overflow cannot clip
  // it. It uses page coordinates (absolute), not `fixed`, because the desktop
  // layout scales the whole page with a transform, which would otherwise move
  // every fixed element off its trigger.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const measure = () => {
      const trigger = ref.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 12;
      const width = Math.min(Math.max(rect.width, 200), window.innerWidth - margin * 2);
      // Start under the trigger, slide left only as far as needed to stay on
      // screen, and never further left than the viewport margin.
      let left = rect.left;
      if (left + width > window.innerWidth - margin) left = rect.right - width;
      left = Math.max(margin, Math.min(left, window.innerWidth - margin - width)) + window.scrollX;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const above = spaceBelow < 200 && spaceAbove > spaceBelow;
      const available = Math.max(160, above ? spaceAbove : spaceBelow);
      setPosition({
        left,
        width,
        top: (above ? rect.top - 4 : rect.bottom + 4) + window.scrollY,
        maxHeight: Math.min(320, available),
        above,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  // Click-away, Escape, and page scroll all dismiss the list. Scrolling the
  // list itself is ignored so it can be browsed on a phone.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onScroll = (event: Event) => {
      if (listRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  // A swipe inside the list must browse the options, never the page behind it.
  // `overscroll-behavior` covers modern engines; this also stops the rubber
  // band on the list's ends for older mobile Safari.
  useEffect(() => {
    const list = listRef.current;
    if (!open || !list) return;
    let startY = 0;
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (event.touches.length === 1 && touch) startY = touch.clientY;
    };
    const onTouchMove = (event: TouchEvent) => {
      // Multi-touch is a pinch: leave it to the browser.
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch) return;
      const pull = startY - touch.clientY;
      const atTop = list.scrollTop <= 0;
      const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
      if (list.scrollHeight <= list.clientHeight + 1 || (pull > 0 ? atBottom : atTop)) {
        event.preventDefault();
      }
    };
    list.addEventListener("touchstart", onTouchStart, { passive: true });
    list.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      list.removeEventListener("touchstart", onTouchStart);
      list.removeEventListener("touchmove", onTouchMove);
    };
    // `position` flips to a value one commit after `open`, which is when the
    // portalled list actually mounts; without it the ref is still empty here.
  }, [open, position]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        aria-disabled={disabled || undefined}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        title={value}
        className={`flex h-full w-full items-center justify-between gap-2 rounded-[10px] border border-border bg-surface shadow-[var(--shadow-soft)] ${
          disabled || small ? "px-3 text-[14px]" : "px-4 text-[16px]"
        } ${disabled ? "cursor-not-allowed text-ink-faint" : "cursor-pointer text-ink"}`}
      >
        <span className="truncate">{value}</span>
        <ChevronDown className="size-3.5 shrink-0" strokeWidth={1.5} />
      </button>
      {open && !disabled && position
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              aria-label={value}
              className="absolute z-[1000] overflow-y-auto overscroll-contain rounded-[10px] border border-border bg-surface py-1 shadow-[var(--shadow-soft)]"
              style={{
                left: position.left,
                width: position.width,
                top: position.top,
                maxHeight: position.maxHeight,
                transform: position.above ? "translateY(-100%)" : undefined,
                touchAction: "pan-y",
              }}
            >
              {options.map((o) => (
                <li key={o}>
                  <button
                    type="button"
                    aria-current={o === value || undefined}
                    onClick={() => {
                      onChange(o);
                      setOpen(false);
                    }}
                    className={`block w-full cursor-pointer whitespace-normal break-words px-4 py-2 text-left text-[15px] leading-snug hover:bg-canvas ${
                      o === value ? "text-ink" : "text-ink-soft"
                    }`}
                  >
                    {o}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
