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
  BookOpenCheck,
  ChartNoAxesCombined,
  CornerDownLeft,
  Eye,
  GitBranch,
  Info,
  LoaderCircle,
  MessageCircle,
  Mic,
  Plus,
  Square,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import worldMap from "@/assets/world-map.jpg";
import {
  CAPABILITIES,
  DEMO_SNAPSHOT,
  askHaqi,
  type AnswerComparison,
  type CapabilityId,
  type DemoAnswer,
  type Tone,
} from "@/data/ask";
import { useSpeechInput } from "@/hooks/use-speech";
import { K, canvasPosition } from "@/lib/canvas";

type AskPageProps = {
  desktop: boolean;
  onViewFullMap: () => void;
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
      className={`flex flex-col rounded-[18px] border border-border bg-surface p-5 shadow-[var(--shadow-soft)] ${
        desktop ? "h-full" : "min-h-[540px] w-full max-w-[520px] justify-self-center"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-canvas text-ink">
          <Icon className="size-5" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[25px] leading-[1.25] text-ink">{capability.title}</h2>
          <p className="mt-1.5 text-[16px] leading-[1.55] text-ink-soft">
            {capability.description}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[12px] uppercase tracking-[0.1em] text-ink-faint">Try asking</p>
        <ul className="mt-2 space-y-1">
          {capability.prompts.map((prompt) => (
            <li key={prompt}>
              <button
                type="button"
                onClick={() => onPrompt(prompt)}
                className="group flex min-h-10 w-full items-start gap-2 rounded-[8px] px-2 py-2.5 text-left text-[15px] leading-[1.5] text-ink-soft transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
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
      </div>

      <p className="mt-auto pt-4 text-[13px] leading-[1.5] text-ink-faint">
        Tap a question to add it to the composer.
      </p>
    </article>
  );
}

/** Compact, non-interactive reminder of the four capabilities in the answer state. */
function CapabilityStrip({ desktop }: { desktop: boolean }) {
  return (
    <div
      role="group"
      style={desktop ? pos(true, 119, 236, 1200, 40) : undefined}
      aria-label="HAQI capabilities"
      className={`flex flex-wrap gap-2 ${desktop ? "" : "mt-5"}`}
    >
      {CAPABILITIES.map((capability) => {
        const Icon = CAPABILITY_ICONS[capability.id];
        return (
          <span
            key={capability.id}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] text-ink-soft"
          >
            <Icon className="size-3.5 shrink-0" strokeWidth={1.6} />
            {capability.title}
          </span>
        );
      })}
    </div>
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

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    const max = desktop ? 160 : 140;
    element.style.height = `${Math.min(element.scrollHeight, max)}px`;
    element.style.overflowY = element.scrollHeight > max ? "auto" : "hidden";
  }, [value, desktop, textareaRef]);

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
      className={`flex flex-col rounded-[18px] border border-border bg-surface p-4 shadow-[var(--shadow-soft)] ${
        desktop ? "h-full p-5" : ""
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
        className="min-h-[96px] w-full resize-none bg-transparent text-[17px] leading-[1.55] text-ink outline-none placeholder:text-ink-faint"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 text-[12px] leading-[1.4] text-ink-faint" aria-live="polite">
          {listening ? (
            <span className="flex items-center gap-2 text-risk-red">
              <span className="size-2 animate-pulse rounded-full bg-risk-red motion-reduce:animate-none" />
              Listening — speak, then stop when you are done.
            </span>
          ) : thinking ? (
            "HAQI is checking the demo fixtures…"
          ) : speechSupported ? (
            "Enter to send · Shift+Enter for a new line"
          ) : (
            "Voice input is unavailable in this browser — type your question instead."
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
            className={`relative flex size-11 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
              listening
                ? "border-risk-red bg-risk-red text-surface"
                : "border-border bg-canvas text-ink hover:border-ink/25"
            }`}
          >
            {listening && (
              <span
                aria-hidden
                className="absolute inset-0 -z-10 animate-ping rounded-full bg-risk-red/30 motion-reduce:animate-none"
              />
            )}
            {listening ? (
              <Square className="size-3.5 fill-current" strokeWidth={1.6} />
            ) : (
              <Mic className="size-4" strokeWidth={1.6} />
            )}
          </button>

          <button
            type="submit"
            disabled={!canSend}
            aria-label={thinking ? "HAQI is thinking" : "Send question"}
            className={`flex size-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
              canSend
                ? "bg-ink text-surface hover:opacity-90"
                : "cursor-not-allowed bg-bar-idle/35 text-ink-faint"
            }`}
          >
            {thinking ? (
              <LoaderCircle
                className="size-4 animate-spin motion-reduce:animate-none"
                strokeWidth={1.8}
              />
            ) : (
              <ArrowUp className="size-4" strokeWidth={2.2} />
            )}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ---------- answer ---------- */

function Comparison({ comparison }: { comparison: AnswerComparison }) {
  return (
    <div className="mt-5 rounded-[14px] border border-border px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-medium text-ink">{comparison.title}</h3>
        <span className="text-[10px] uppercase tracking-[0.08em] text-ink-faint">AQI</span>
      </div>
      <ul className="mt-3 space-y-3">
        {comparison.bars.map((bar) => (
          <li key={bar.label}>
            <div className="flex items-center justify-between gap-3 text-[13px]">
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
      <p className="mt-3 text-[11px] leading-[1.4] text-ink-faint">{comparison.caption}</p>
    </div>
  );
}

function AnswerBody({ answer }: { answer: DemoAnswer }) {
  return (
    <div aria-live="polite">
      <span className="inline-flex items-center gap-2 rounded-full bg-canvas px-3 py-1 text-[12px] text-ink">
        <span aria-hidden className={`size-2 rounded-full ${DOT[answer.verdictTone]}`} />
        {answer.verdict}
      </span>

      <h2 className="mt-3 font-display text-[26px] leading-[1.3] text-ink">{answer.title}</h2>
      <p className="mt-2 text-[16px] leading-[1.6] text-ink-soft">{answer.summary}</p>

      <div className="mt-5 grid gap-2 min-[520px]:grid-cols-3">
        {answer.metrics.map((metric) => (
          <div key={metric.label} className="rounded-[12px] bg-canvas px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.08em] text-ink-faint">
              {metric.label}
            </div>
            <div className="mt-1 text-[22px] leading-none text-ink">{metric.value}</div>
            <div className="mt-1.5 text-[12px] leading-[1.4] text-ink-soft">{metric.detail}</div>
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
              <h3 className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-faint">
                {section.heading}
              </h3>
              {section.kind === "hypothesis" && (
                <span className="rounded-full bg-risk-orange-soft px-2 py-0.5 text-[10px] text-ink">
                  Not confirmed
                </span>
              )}
            </div>
            <p className="mt-2 text-[14px] leading-[1.6] text-ink-soft">{section.body}</p>
            {section.bullets && (
              <ul className="mt-2 space-y-1.5">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2 text-[13px] leading-[1.5] text-ink-soft">
                    <span
                      aria-hidden
                      className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-faint"
                    />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="mt-6 border-t border-border pt-4 text-[11px] leading-[1.5] text-ink-faint">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.6} />
          <p>
            <span className="font-medium text-ink-soft">{answer.provenance.label}</span> ·{" "}
            {answer.provenance.window}
            <br />
            {answer.provenance.note} Snapshot {DEMO_SNAPSHOT}.
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
        <p className="text-[14px]">HAQI is reading the demo fixtures…</p>
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
  onNewQuestion,
  scrollRef,
}: {
  exchange: Exchange;
  desktop: boolean;
  onNewQuestion: () => void;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      style={desktop ? autoPos(true, 119, 300, 1080, 890) : undefined}
      className={`flex flex-col overflow-hidden rounded-[18px] border border-border bg-surface shadow-[var(--shadow-soft)] ${
        desktop ? "" : "mt-5"
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-canvas text-ink">
            <MessageCircle className="size-3.5" strokeWidth={1.7} />
          </span>
          <span className="truncate text-[12px] text-ink-soft">HAQI answer</span>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-ink-faint">
            Demo data
          </span>
        </div>
        <button
          type="button"
          onClick={onNewQuestion}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-ink/25 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        >
          <Plus className="size-3.5" strokeWidth={1.8} />
          New question
        </button>
      </div>

      <div
        ref={scrollRef}
        className={desktop ? "min-h-0 flex-1 overflow-y-auto" : "overflow-visible"}
      >
        <div className={`px-5 ${desktop ? "py-6" : "py-5"}`}>
          <div className="rounded-[12px] border border-border bg-canvas px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.1em] text-ink-faint">You asked</p>
            <p className="mt-1 text-[15px] leading-[1.5] text-ink">{exchange.question}</p>
          </div>

          {exchange.answer ? (
            <div className="mt-6">
              <AnswerBody answer={exchange.answer} />
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
      style={desktop ? autoPos(true, 1227, 632, 661, 350) : undefined}
      className={`rounded-[18px] border border-border bg-surface p-5 shadow-[var(--shadow-soft)] ${
        desktop ? "" : "mt-4"
      }`}
    >
      <h2 className="text-[16px] text-ink">Keep exploring</h2>
      <p className="mt-1 text-[12px] leading-[1.5] text-ink-soft">
        These fill the composer so you can edit before sending.
      </p>
      <ul className="mt-3 space-y-1">
        {unique.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              onClick={() => onPick(prompt)}
              className="group flex min-h-10 w-full items-start gap-2 rounded-[8px] px-2 py-2.5 text-left text-[13px] leading-[1.45] text-ink-soft transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
            >
              <CornerDownLeft
                className="mt-0.5 size-3.5 shrink-0 text-ink-faint group-hover:text-ink"
                strokeWidth={1.6}
              />
              <span>{prompt}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-border pt-3 text-[11px] leading-[1.5] text-ink-faint">
        Follow-ups fill the composer. Edit one before sending, or ask your own question.
      </p>
    </div>
  );
}

function DemoNote({ desktop, variant }: { desktop: boolean; variant: "welcome" | "answer" }) {
  const body =
    "HAQI is answering from local demo fixtures. Nothing here is a live reading, and no question leaves your browser.";

  if (variant === "welcome") {
    return (
      <div
        style={desktop ? autoPos(true, 119, 1096, 1200, 80) : undefined}
        className={`text-[12px] leading-[1.5] ${desktop ? "" : "mt-4"}`}
      >
        <div className="inline-flex max-w-full items-start gap-2 rounded-[10px] border border-border bg-surface px-3 py-2 text-ink-soft shadow-[var(--shadow-soft)]">
          <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.6} />
          <p>{body} Voice input uses your browser&apos;s speech recognition where available.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={desktop ? autoPos(true, 1227, 1000, 661, 200) : undefined}
      className={`rounded-[18px] border border-border bg-surface p-5 ${desktop ? "" : "mt-4"}`}
    >
      <div className="flex items-center gap-2 text-ink">
        <Info className="size-4" strokeWidth={1.6} />
        <h2 className="text-[14px]">About these answers</h2>
      </div>
      <p className="mt-2 text-[11px] leading-[1.55] text-ink-faint">
        {body} The same question always returns the same response, which makes the prototype
        predictable while the backend is being built.
      </p>
    </div>
  );
}

/* ---------- page ---------- */

export function AskPage({ desktop, onViewFullMap }: AskPageProps) {
  const [text, setText] = useState("");
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [thinking, setThinking] = useState(false);
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
    setText("");
    speechBase.current = "";

    try {
      const answer = await askHaqi({ question });
      if (requestId.current !== id) return;
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
    setExchange(null);
    setThinking(false);
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

      <div
        style={desktop ? pos(true, 119, 112, 1040, 96) : undefined}
        className={desktop ? "" : "mt-6 pr-[164px]"}
      >
        <h1
          className={`font-display leading-[1.2] tracking-[-0.01em] text-ink ${
            desktop ? "text-[42px]" : "text-[38px]"
          }`}
        >
          Ask HAQI
        </h1>
        <p className="mt-1 text-[17px] leading-[1.45] text-ink-soft">
          {desktop
            ? "Ask about the air around you. Answers are clear, sourced from demo data, and easy to check."
            : "Clear answers about the air around you, built from demo data."}
        </p>
      </div>

      <button
        type="button"
        onClick={onViewFullMap}
        style={desktop ? pos(true, 1729, 141, 160, 48) : undefined}
        className={`flex shrink-0 items-center justify-center gap-2 rounded-[10px] bg-ink text-[16px] text-surface transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
          desktop ? "" : "absolute right-0 top-6 h-10 px-3 text-[13px]"
        }`}
      >
        View Full Map <Eye className="size-5" strokeWidth={1.6} />
      </button>

      {exchange ? (
        <>
          <CapabilityStrip desktop={desktop} />

          <div ref={answerTopRef}>
            <AnswerPanel
              exchange={exchange}
              desktop={desktop}
              onNewQuestion={startNewQuestion}
              scrollRef={answerScrollRef}
            />
          </div>

          {exchange.answer && (
            <FollowUps answer={exchange.answer} desktop={desktop} onPick={usePrompt} />
          )}

          <div
            style={desktop ? pos(true, 1227, 300, 661, 300) : undefined}
            className={desktop ? "" : "mt-4"}
          >
            {composer("Ask a follow-up")}
          </div>

          <DemoNote desktop={desktop} variant="answer" />
        </>
      ) : (
        <>
          <div
            style={desktop ? pos(true, 119, 250, 1728, 560) : undefined}
            className={
              desktop ? "grid grid-cols-4 gap-6" : "mt-6 grid gap-4 min-[700px]:grid-cols-2"
            }
          >
            {CAPABILITIES.map((item) => (
              <CapabilityCard key={item.id} id={item.id} desktop={desktop} onPrompt={usePrompt} />
            ))}
          </div>

          <div
            style={desktop ? pos(true, 119, 840, 1728, 240) : undefined}
            className={desktop ? "" : "mt-4"}
          >
            {composer()}
          </div>

          <DemoNote desktop={desktop} variant="welcome" />
        </>
      )}
    </div>
  );
}
