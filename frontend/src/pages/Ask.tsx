import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowUp,
  BadgeQuestionMark,
  BookOpenCheck,
  ChartNoAxesCombined,
  CircleAlert,
  CirclePlus,
  CornerDownLeft,
  Eye,
  GitBranch,
  Info,
  LoaderCircle,
  MessageCircle,
  Mic,
  Paperclip,
  Plus,
  Square,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import worldMap from "@/assets/world-map.jpg";
import {
  CAPABILITIES,
  DEMO_SNAPSHOT,
  FIXTURES_MODE,
  askHaqi,
  type AnswerComparison,
  type CapabilityId,
  type DemoAnswer,
  type Tone,
} from "@/data/ask";
import { useSpeechInput } from "@/hooks/use-speech";
import { K, W, canvasPosition } from "@/lib/canvas";

type AskPageProps = {
  desktop: boolean;
  onViewFullMap: () => void;
  onViewWhy: () => void;
};

const CAPABILITY_ICONS: Record<CapabilityId, LucideIcon> = {
  analyze: ChartNoAxesCombined,
  ask: MessageCircle,
  why: GitBranch,
  sources: BookOpenCheck,
};

const DOT: Record<Tone, string> = {
  red: "bg-risk-red",
  orange: "bg-risk-orange",
  teal: "bg-risk-teal",
  green: "bg-risk-green",
  neutral: "bg-ink-faint",
};

const BAR: Record<Tone, string> = DOT;

const SECTION_DOT: Record<DemoAnswer["sections"][number]["kind"], string> = {
  observed: "bg-ink",
  hypothesis: "bg-risk-orange",
  context: "bg-ink-faint",
};

const pos = (desktop: boolean, left: number, top: number, width: number, height: number) =>
  canvasPosition(desktop, left, top, width, height);

/**
 * Shared design width for the capability card grid and the composer, so the
 * text box + icon rail + their gap line up with the cards edge to edge.
 */
const CONTENT_W = 1640;

/** Left edge that centres the shared content column on the design canvas. */
const CONTENT_X = Math.round((W / K - CONTENT_W) / 2);

/** Left edge of the answer-state right rail (follow-ups and follow-up composer). */
const RAIL_X = 1227;

/** Answer card width: keeps the 28-unit gutter before the right rail. */
const ANSWER_W = RAIL_X - CONTENT_X - 28;

/** Top edge of the answer state, just below the "Ask HAQI" heading. */
const ANSWER_TOP = 240;

/** Follow-ups rail keeps the same gap below the follow-up composer. */
const FOLLOWUP_TOP = ANSWER_TOP + 332;

/** Capability row placement: top edge, settled content height, and the gap to the composer. */
const CARD_TOP = 250;
const CARD_ROW_H = 333;
const CARD_GAP = 30;
const COMPOSER_TOP = CARD_TOP + CARD_ROW_H + CARD_GAP;

/** Absolute placement that lets a panel size itself to its content. */
const autoPos = (desktop: boolean, left: number, top: number, width: number, maxHeight: number) =>
  desktop
    ? {
        position: "absolute" as const,
        left: left * K,
        top: top * K,
        width: width * K,
        maxHeight: maxHeight * K,
      }
    : undefined;

function focusSoon(ref: RefObject<HTMLTextAreaElement | null>) {
  window.requestAnimationFrame(() => ref.current?.focus());
}

/* ---------- capability cards ---------- */

type CapabilityCardProps = {
  id: CapabilityId;
  desktop: boolean;
  onPrompt: (prompt: string) => void;
};

function CapabilityCard({ id, desktop, onPrompt }: CapabilityCardProps) {
  const capability = CAPABILITIES.find((item) => item.id === id) ?? CAPABILITIES[0]!;
  const Icon = CAPABILITY_ICONS[id];

  return (
    <article
      className={`flex flex-col rounded-[18px] border border-border bg-surface shadow-[var(--shadow-soft)] ${
        desktop ? "h-full px-5 py-7" : "w-[85%] shrink-0 snap-start px-4 py-5"
      }`}
    >
      <div className={`flex items-start ${desktop ? "gap-3" : "gap-2.5"}`}>
        <span
          className={`flex shrink-0 items-center justify-center bg-canvas text-ink ${
            desktop ? "size-11 rounded-[12px]" : "size-9 rounded-[10px]"
          }`}
        >
          <Icon className={desktop ? "size-5" : "size-4"} strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            className={
              desktop
                ? "text-[25px] leading-[1.25] text-ink"
                : "text-[21px] leading-[1.25] text-ink"
            }
          >
            {capability.title}
          </h2>
          <p
            className={
              desktop
                ? "mt-1.5 text-[16px] leading-[1.55] text-ink-soft"
                : "mt-1 text-[14px] leading-[1.5] text-ink-soft"
            }
          >
            {capability.description}
          </p>
        </div>
      </div>

      <div className={`border-t border-border ${desktop ? "mt-4 pt-3" : "mt-3.5 pt-2.5"}`}>
        <p
          className={`uppercase tracking-[0.1em] text-ink-faint ${
            desktop ? "text-[12px]" : "text-[10px]"
          }`}
        >
          Try asking
        </p>
        <ul className={`space-y-1 ${desktop ? "mt-2" : "mt-1.5"}`}>
          {capability.prompts.map((prompt) => (
            <li key={prompt}>
              <button
                type="button"
                onClick={() => onPrompt(prompt)}
                className={`group flex w-full items-start rounded-[8px] text-left text-ink-soft transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${
                  desktop
                    ? "min-h-10 gap-2 px-2 py-2.5 text-[15px] leading-[1.5]"
                    : "min-h-8 gap-1.5 px-1.5 py-1.5 text-[13px] leading-[1.45]"
                }`}
              >
                <CornerDownLeft
                  className={`mt-0.5 shrink-0 text-ink-faint group-hover:text-ink ${
                    desktop ? "size-4" : "size-3.5"
                  }`}
                  strokeWidth={1.6}
                />
                <span>{prompt}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/* ---------- composer ---------- */

type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  thinking: boolean;
  desktop: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  listening: boolean;
  speechSupported: boolean;
  onToggleMic: () => void;
  label?: string;
};

const CONTEXT_OPTIONS = [
  { label: "Location", value: "Location: Ikeja, Lagos" },
  { label: "Time", value: "Time: right now" },
  { label: "Activity", value: "Activity: outdoor play" },
];

function Composer({
  value,
  onChange,
  onSubmit,
  thinking,
  desktop,
  textareaRef,
  listening,
  speechSupported,
  onToggleMic,
  label,
}: ComposerProps) {
  const canSend = value.trim().length > 0 && !thinking;
  const [contextOpen, setContextOpen] = useState(false);

  const addContext = (context: string) => {
    const trimmed = value.trim();
    onChange(trimmed ? `${context} — ${trimmed}` : `${context} — `);
    setContextOpen(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
      className={`flex gap-3 ${desktop ? "h-full items-stretch" : "flex-col gap-2"}`}
    >
      <div
        className={`flex min-w-0 flex-col rounded-[18px] border border-border bg-surface shadow-[var(--shadow-soft)] ${
          desktop ? "h-full flex-1 p-5" : "h-[169px] w-full p-4"
        }`}
      >
        {label && (
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-ink-faint">
            <span aria-hidden className="size-1.5 rounded-full bg-ink" />
            {label}
          </div>
        )}

        <label htmlFor="ask-question" className="sr-only">
          Your question
        </label>
        <textarea
          id="ask-question"
          ref={textareaRef}
          rows={2}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask HAQI about the air around you..."
          className="min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent text-[17px] leading-[1.55] text-ink outline-none placeholder:text-ink-faint"
        />

        <div className="mt-2 min-w-0 text-[12px] leading-[1.4] text-ink-faint" aria-live="polite">
          {listening ? (
            <span className="flex items-center gap-2 text-risk-red">
              <span className="size-2 animate-pulse rounded-full bg-risk-red motion-reduce:animate-none" />
              Listening — speak, then stop when you are done.
            </span>
          ) : thinking ? (
            FIXTURES_MODE ? (
              "HAQI is checking the demo fixtures…"
            ) : (
              "HAQI is checking live sources…"
            )
          ) : !speechSupported ? (
            "Voice input is unavailable in this browser — type your question instead."
          ) : null}
        </div>
      </div>

      <div
        className={
          desktop
            ? "grid shrink-0 grid-rows-4 gap-2"
            : "relative flex w-full shrink-0 items-center justify-start gap-2"
        }
      >
        <button
          type="button"
          onClick={() => toast("Attachments aren't supported in this demo yet.")}
          title="Attach a file"
          aria-label="Attach a file"
          className={`flex items-center justify-center rounded-[10px] bg-surface text-ink transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
            desktop ? "aspect-square min-h-0" : "size-10 shrink-0"
          }`}
        >
          <Paperclip className="size-[38%]" strokeWidth={1.6} />
        </button>

        <div className={desktop ? "relative flex aspect-square min-h-0" : "flex"}>
          <button
            type="button"
            onClick={() => setContextOpen((open) => !open)}
            title="Add context"
            aria-label="Add context"
            aria-haspopup="menu"
            aria-expanded={contextOpen}
            className={`flex items-center justify-center rounded-[10px] bg-surface text-ink transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
              desktop ? "h-full w-full" : "size-10 shrink-0"
            }`}
          >
            <CirclePlus className="size-[38%]" strokeWidth={1.6} />
          </button>

          {contextOpen && (
            <>
              <div
                aria-hidden
                onClick={() => setContextOpen(false)}
                className="fixed inset-0 z-40 cursor-default"
              />
              <div
                role="menu"
                aria-label="Add context"
                className={`absolute z-50 w-60 rounded-[12px] bg-surface p-2 shadow-[var(--shadow-soft)] ${
                  desktop ? "right-full top-0 mr-2" : "bottom-full left-0 mb-2"
                }`}
              >
                <p className="px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                  Add context
                </p>
                {CONTEXT_OPTIONS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    role="menuitem"
                    aria-label={`Add ${option.value}`}
                    onClick={() => addContext(option.value)}
                    className="flex w-full flex-col items-start rounded-[8px] px-2 py-2 text-left transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
                  >
                    <span className="text-[13px] text-ink">{option.label}</span>
                    <span className="text-[11px] text-ink-faint">{option.value}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleMic}
          title={
            speechSupported
              ? listening
                ? "Stop voice input"
                : "Start voice input"
              : "Voice input is not supported in this browser"
          }
          aria-label={
            speechSupported
              ? listening
                ? "Stop voice input"
                : "Start voice input"
              : "Voice input unavailable in this browser"
          }
          aria-pressed={listening}
          className={`relative flex items-center justify-center rounded-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
            desktop ? "aspect-square min-h-0" : "size-10 shrink-0"
          } ${listening ? "bg-risk-red text-surface" : "bg-surface text-ink hover:bg-canvas"}`}
        >
          {listening && (
            <span
              aria-hidden
              className="absolute inset-0 -z-10 animate-ping rounded-[10px] bg-risk-red/30 motion-reduce:animate-none"
            />
          )}
          {listening ? (
            <Square className="size-[32%] fill-current" strokeWidth={1.6} />
          ) : (
            <Mic className="size-[38%]" strokeWidth={1.6} />
          )}
        </button>

        <button
          type="submit"
          disabled={!canSend}
          aria-label={thinking ? "HAQI is thinking" : "Send question"}
          className={`flex items-center justify-center rounded-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
            desktop ? "aspect-square min-h-0" : "size-10 shrink-0"
          } ${
            canSend
              ? "bg-surface text-ink hover:bg-canvas"
              : "cursor-not-allowed bg-surface text-ink-faint/50"
          }`}
        >
          {thinking ? (
            <LoaderCircle
              className="size-[38%] animate-spin motion-reduce:animate-none"
              strokeWidth={1.8}
            />
          ) : (
            <ArrowUp className="size-[38%]" strokeWidth={2.2} />
          )}
        </button>
      </div>
    </form>
  );
}

/* ---------- answer ---------- */

function Comparison({ comparison }: { comparison: AnswerComparison }) {
  return (
    <div className="mt-5 rounded-[14px] border border-border px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium text-ink text-[14px]">{comparison.title}</h3>
        <span className="uppercase tracking-[0.08em] text-ink-faint text-[10px]">AQI</span>
      </div>
      <ul className="mt-3 space-y-3">
        {comparison.bars.map((bar) => (
          <li key={bar.label}>
            <div className="flex items-center justify-between gap-3 text-[14px]">
              <span className="truncate text-ink">{bar.label}</span>
              <span className="shrink-0 text-ink-soft">{bar.display}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
              <div
                className={`h-full rounded-full ${BAR[bar.tone]}`}
                style={{ width: `${Math.min(100, (bar.value / comparison.max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 leading-[1.5] text-ink-faint text-[12px]">{comparison.caption}</p>
    </div>
  );
}

function AnswerBody({ answer, onViewWhy }: { answer: DemoAnswer; onViewWhy: () => void }) {
  const blindSpots = answer.blindSpots?.filter((spot) => spot.trim() && spot.trim() !== "-") ?? [];
  return (
    <div aria-live="polite">
      {!answer.provenance.live && (
        <div
          role="status"
          className="mb-3 flex items-start gap-2 rounded-[12px] border border-dashed border-risk-orange/70 bg-risk-orange-soft px-4 py-3 leading-[1.55] text-ink-soft text-[13px]"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-ink" strokeWidth={1.6} />
          <p>
            <span className="font-medium text-ink">
              {answer.provenance.label.startsWith("Fallback")
                ? "Honest fallback data."
                : "Offline demo mode."}
            </span>{" "}
            {answer.provenance.label.startsWith("Fallback")
              ? "A live source was unreachable, so the backend returned a labelled fixture verdict. Treat it as an example, not today's air."
              : "Fixtures are switched on (VITE_USE_FIXTURES=true). Turn them off to read live sources."}
          </p>
        </div>
      )}

      <span className="inline-flex items-center gap-2 rounded-full bg-canvas px-3 py-1 text-ink text-[13px]">
        <span aria-hidden className={`size-2 rounded-full ${DOT[answer.verdictTone]}`} />
        {answer.verdict}
      </span>

      <h2 className="mt-3 font-display leading-[1.25] text-ink text-[28px]">{answer.title}</h2>
      <div className="mt-2 flex items-start gap-2">
        <p className="min-w-0 flex-1 leading-[1.6] text-ink-soft text-[17px]">{answer.summary}</p>
        <button
          type="button"
          onClick={onViewWhy}
          aria-label="View the evidence behind this decision"
          title="See why"
          className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          <BadgeQuestionMark className="size-5" strokeWidth={1.7} />
        </button>
      </div>

      <div className="mt-5 grid gap-2 min-[520px]:grid-cols-3">
        {answer.metrics.map((metric) => (
          <div key={metric.label} className="rounded-[12px] bg-canvas px-4 py-3">
            <div className="uppercase tracking-[0.08em] text-ink-faint text-[10px]">
              {metric.label}
            </div>
            <div className="mt-1 leading-none text-ink text-[24px]">{metric.value}</div>
            <div className="mt-1.5 leading-[1.45] text-ink-soft text-[13px]">{metric.detail}</div>
          </div>
        ))}
      </div>

      {answer.comparison && <Comparison comparison={answer.comparison} />}

      <div className="mt-6 space-y-5">
        {answer.sections.map((section) => (
          <section
            key={section.heading}
            className={
              section.kind === "hypothesis"
                ? "rounded-[12px] border border-dashed border-border p-4"
                : ""
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <span aria-hidden className={`size-1.5 rounded-full ${SECTION_DOT[section.kind]}`} />
              <h3 className="font-medium uppercase tracking-[0.1em] text-ink-faint text-[11px]">
                {section.heading}
              </h3>
              {section.kind === "hypothesis" && (
                <span className="rounded-full bg-risk-orange-soft px-2 py-0.5 text-ink text-[10px]">
                  Not confirmed
                </span>
              )}
            </div>
            <p className="mt-2 leading-[1.65] text-ink-soft text-[15px]">{section.body}</p>
            {section.bullets && (
              <ul className="mt-2 space-y-2">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2 leading-[1.55] text-ink-soft text-[14px]">
                    <span
                      aria-hidden
                      className="mt-[8px] size-1 shrink-0 rounded-full bg-ink-faint"
                    />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {blindSpots.length > 0 ? (
        <div className="mt-6">
          <h3 className="font-medium uppercase tracking-[0.1em] text-ink-faint text-[11px]">
            Blind spots
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {blindSpots.map((spot) => (
              <li
                key={spot}
                className="inline-flex max-w-full items-start gap-1.5 rounded-full border border-dashed border-border bg-canvas px-3 py-1.5 leading-[1.45] text-ink-soft text-[12px]"
              >
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.6} />
                <span>{spot}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : answer.provenance.live ? (
        <p className="mt-6 leading-[1.55] text-ink-faint text-[12px]">
          Every source configured for this check answered.
        </p>
      ) : null}

      <div className="mt-6 border-t border-border pt-4 leading-[1.55] text-ink-faint text-[12px]">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.6} />
          <p>
            <span className="font-medium text-ink-soft">{answer.provenance.label}</span> ·{" "}
            {answer.provenance.window}
            <br />
            {answer.provenance.note}
            {answer.provenance.live ? "" : ` Snapshot ${DEMO_SNAPSHOT}.`}
          </p>
        </div>
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="mt-5 rounded-[14px] border border-border bg-canvas px-4 py-5">
      <div className="flex items-center gap-3 text-ink">
        <LoaderCircle
          className="size-4 animate-spin motion-reduce:animate-none"
          strokeWidth={1.8}
        />
        <p className="text-[15px]">
          {FIXTURES_MODE ? "HAQI is reading the demo fixtures…" : "HAQI is checking live sources…"}
        </p>
      </div>
      <div className="mt-4 space-y-2">
        {[100, 92, 76].map((width) => (
          <div
            key={width}
            className="h-2 animate-pulse rounded-full bg-bar-idle/40 motion-reduce:animate-none"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>
    </div>
  );
}

type Exchange = {
  question: string;
  answer: DemoAnswer | null;
};

function AnswerPanel({
  exchange,
  desktop,
  wide,
  onNewQuestion,
  onViewWhy,
  scrollRef,
}: {
  exchange: Exchange;
  desktop: boolean;
  wide: boolean;
  onNewQuestion: () => void;
  onViewWhy: () => void;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const liveAnswer = exchange.answer ? exchange.answer.provenance.live : !FIXTURES_MODE;

  return (
    <div
      style={
        desktop ? autoPos(true, CONTENT_X, ANSWER_TOP, wide ? CONTENT_W : ANSWER_W, 890) : undefined
      }
      className={`flex flex-col overflow-hidden rounded-[18px] border border-border bg-surface shadow-[var(--shadow-soft)] ${
        desktop ? "transition-[width] duration-300 ease-out motion-reduce:transition-none" : "mt-5"
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-canvas text-ink">
            <MessageCircle className="size-3.5" strokeWidth={1.7} />
          </span>
          <span className="truncate text-[13px] text-ink-soft">HAQI answer</span>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
              liveAnswer ? "border-risk-green/40 text-risk-green" : "border-border text-ink-faint"
            }`}
          >
            {liveAnswer ? "Live" : "Demo data"}
          </span>
        </div>
        <button
          type="button"
          onClick={onNewQuestion}
          aria-label="New question"
          className="flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border px-3 py-1.5 text-ink transition-colors hover:border-ink/25 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 text-[12px]"
        >
          <Plus className="size-3.5" strokeWidth={1.8} />
          New<span className="hidden min-[420px]:inline"> question</span>
        </button>
      </div>

      <div
        ref={scrollRef}
        className={desktop ? "min-h-0 flex-1 overflow-y-auto" : "overflow-visible"}
      >
        <div className={`px-5 ${desktop ? "py-6" : "py-5"}`}>
          <div className="rounded-[12px] border border-border bg-canvas px-4 py-3">
            <p className="uppercase tracking-[0.1em] text-ink-faint text-[10px]">You asked</p>
            <p className="mt-1 leading-[1.55] text-ink text-[16px]">{exchange.question}</p>
          </div>

          {exchange.answer ? (
            <div className="mt-6">
              <AnswerBody answer={exchange.answer} onViewWhy={onViewWhy} />
            </div>
          ) : (
            <Thinking />
          )}
        </div>
      </div>
    </div>
  );
}

function FollowUps({
  answer,
  desktop,
  onPick,
}: {
  answer: DemoAnswer;
  desktop: boolean;
  onPick: (prompt: string) => void;
}) {
  const unique = answer.followUps.filter(
    (prompt, index) => answer.followUps.indexOf(prompt) === index,
  );

  return (
    <div
      style={desktop ? autoPos(true, RAIL_X, FOLLOWUP_TOP, 661, 350) : undefined}
      className={`rounded-[18px] border border-border bg-surface p-5 shadow-[var(--shadow-soft)] ${
        desktop ? "" : "mt-4"
      }`}
    >
      <h2 className="text-ink text-[17px]">Keep exploring</h2>
      <p className="mt-1 leading-[1.55] text-ink-soft text-[13px]">
        These fill the composer so you can edit before sending.
      </p>
      <ul className="mt-3 space-y-1">
        {unique.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              onClick={() => onPick(prompt)}
              className="group flex min-h-10 w-full items-start gap-2 rounded-[8px] px-2 py-2.5 text-left leading-[1.5] text-ink-soft transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 text-[14px]"
            >
              <CornerDownLeft
                className="mt-0.5 size-4 shrink-0 text-ink-faint group-hover:text-ink"
                strokeWidth={1.6}
              />
              <span>{prompt}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-border pt-3 leading-[1.55] text-ink-faint text-[12px]">
        Follow-ups fill the composer. Edit one before sending, or ask your own question.
      </p>
    </div>
  );
}

/* ---------- page ---------- */

export function AskPage({ desktop, onViewFullMap, onViewWhy }: AskPageProps) {
  const [text, setText] = useState("");
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [thinking, setThinking] = useState(false);
  // Desktop answer state: the verdict fills the content width until the reader
  // asks a new question, which slides the composer in from the right rail.
  const [composerOpen, setComposerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const answerScrollRef = useRef<HTMLDivElement>(null);
  const answerTopRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const speechBase = useRef("");

  const { supported, listening, start, stop } = useSpeechInput({
    onTranscript: (transcript, isFinal) => {
      const base = speechBase.current.trim();
      const joined = [base, transcript].filter(Boolean).join(base ? " " : "");
      setText(joined);
      if (isFinal) speechBase.current = joined;
    },
    onError: (message) => toast.error(message),
  });

  const usePrompt = (prompt: string) => {
    setText(prompt);
    focusSoon(textareaRef);
  };

  const toggleMic = () => {
    if (!supported) {
      toast.info("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (listening) {
      stop();
      return;
    }
    speechBase.current = text;
    start();
  };

  const submit = async () => {
    const question = text.trim();
    if (!question || thinking) return;

    const id = requestId.current + 1;
    requestId.current = id;
    setExchange({ question, answer: null });
    setThinking(true);
    setComposerOpen(false);
    setText("");
    speechBase.current = "";

    try {
      const answer = await askHaqi({ question });
      if (requestId.current !== id) return;
      if (answer.provenance.live && answer.ledgerId) {
        window.localStorage.setItem("haqi:last-live-ledger", answer.ledgerId);
      } else {
        window.localStorage.removeItem("haqi:last-live-ledger");
      }
      window.dispatchEvent(new Event("haqi:live-ledger"));
      setExchange({ question, answer });
    } catch {
      if (requestId.current !== id) return;
      setExchange(null);
      setText(question);
      toast.error("HAQI could not build an answer. Please try again.");
    } finally {
      if (requestId.current === id) setThinking(false);
    }
  };

  const startNewQuestion = () => {
    requestId.current += 1;
    setThinking(false);
    if (desktop && exchange?.answer) {
      // Keep the current verdict visible and shrink it as the composer slides
      // in from the right.
      setComposerOpen(true);
      focusSoon(textareaRef);
      return;
    }
    setComposerOpen(false);
    setExchange(null);
    focusSoon(textareaRef);
  };

  const exchangeQuestion = exchange?.question ?? null;

  useEffect(() => {
    if (!exchangeQuestion) return;
    if (desktop) {
      const scroller = answerScrollRef.current;
      if (typeof scroller?.scrollTo === "function") scroller.scrollTo({ top: 0 });
      return;
    }
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = answerTopRef.current;
    if (typeof target?.scrollIntoView === "function") {
      target.scrollIntoView({
        behavior: reduce ? "auto" : "smooth",
        block: "start",
      });
    }
  }, [exchangeQuestion, desktop]);

  const composer = (label?: string) => (
    <Composer
      value={text}
      onChange={setText}
      onSubmit={submit}
      thinking={thinking}
      desktop={desktop}
      textareaRef={textareaRef}
      listening={listening}
      speechSupported={supported}
      onToggleMic={toggleMic}
      {...(label ? { label } : {})}
    />
  );

  return (
    <div className={desktop ? "contents" : "relative isolate"}>
      {!desktop && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]">
          <img
            src={worldMap}
            alt=""
            className="h-full w-full object-cover opacity-30"
            style={{
              maskImage: "linear-gradient(to bottom, black 10%, transparent 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 10%, transparent 100%)",
            }}
          />
        </div>
      )}

      <div className={desktop ? "contents" : "mt-6 flex items-center justify-between gap-3"}>
        <div
          style={desktop ? pos(true, CONTENT_X, 137, 1040, 96) : undefined}
          className={desktop ? "" : "min-w-0"}
        >
          <h1
            className={`font-display leading-[1.2] tracking-[-0.01em] text-black ${
              desktop ? "text-[42px]" : "text-[30px]"
            }`}
          >
            Ask HAQI
          </h1>
        </div>

        <button
          type="button"
          onClick={onViewFullMap}
          style={desktop ? pos(true, 1729, 141, 160, 48) : undefined}
          className={`flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-ink text-surface transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
            desktop ? "text-[16px]" : "h-8 px-3 text-[12px]"
          }`}
        >
          View Full Map <Eye className={desktop ? "size-5" : "size-4"} strokeWidth={1.6} />
        </button>
      </div>

      {exchange ? (
        <>
          <div ref={answerTopRef}>
            <AnswerPanel
              exchange={exchange}
              desktop={desktop}
              wide={desktop && !composerOpen}
              onNewQuestion={startNewQuestion}
              onViewWhy={onViewWhy}
              scrollRef={answerScrollRef}
            />
          </div>

          {exchange.answer && (!desktop || composerOpen) && (
            <FollowUps answer={exchange.answer} desktop={desktop} onPick={usePrompt} />
          )}

          {(!desktop || composerOpen) && (
            <div
              style={desktop ? pos(true, RAIL_X, ANSWER_TOP, 661, 300) : undefined}
              className={desktop ? "rail-in" : "mt-4"}
            >
              {composer("Ask a follow-up")}
            </div>
          )}
        </>
      ) : (
        <>
          <div
            style={desktop ? autoPos(true, CONTENT_X, CARD_TOP, CONTENT_W, 560) : undefined}
            className={
              desktop
                ? "grid grid-cols-4 gap-6"
                : "mt-6 -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-6 px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            }
          >
            {CAPABILITIES.map((item) => (
              <CapabilityCard key={item.id} id={item.id} desktop={desktop} onPrompt={usePrompt} />
            ))}
          </div>

          <div
            style={desktop ? pos(true, CONTENT_X, COMPOSER_TOP, CONTENT_W, 240) : undefined}
            className={desktop ? "" : "mt-4"}
          >
            {composer()}
          </div>
        </>
      )}
    </div>
  );
}
