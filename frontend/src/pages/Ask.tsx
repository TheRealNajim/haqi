import { useEffect, useState, type FormEvent } from "react";
import { askQuestion, fetchAskSuggestions } from "@/api";
import { VerdictCard } from "@/components/VerdictCard";
import type { AskVerdict } from "@/types";
import "./Ask.css";

type AnswerState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      question: string;
      verdict: AskVerdict;
    }
  | { status: "error"; message: string };

export function AskPage() {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [answer, setAnswer] = useState<AnswerState>({ status: "idle" });

  useEffect(() => {
    let alive = true;
    fetchAskSuggestions().then((list) => {
      if (alive) setSuggestions(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function submit(question: string) {
    const q = question.trim();
    if (!q) return;
    setInput(q);
    setAnswer({ status: "loading" });
    try {
      const result = await askQuestion(q);
      setAnswer({
        status: "ready",
        question: result.question_echo,
        verdict: {
          level: result.level,
          window: result.window,
          reason: result.reason,
          aqi: result.aqi,
          small_print: result.small_print,
        },
      });
    } catch (err) {
      setAnswer({
        status: "error",
        message: err instanceof Error ? err.message : "Could not answer that.",
      });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(input);
  }

  return (
    <div className="ask-page">
      <header className="page-head">
        <p className="page-kicker">Ask</p>
        <h1 className="page-title">Can I play outside?</h1>
        <p className="page-lede">
          Type what you want to do. haqi answers with a clear verdict card — not a
          chat wall of text.
        </p>
      </header>

      <form className="ask-form panel" onSubmit={onSubmit}>
        <label className="ask-form__label" htmlFor="ask-input">
          Your question
        </label>
        <div className="ask-form__row">
          <input
            id="ask-input"
            className="ask-form__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. football after school?"
            autoComplete="off"
            enterKeyHint="send"
          />
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!input.trim() || answer.status === "loading"}
          >
            {answer.status === "loading" ? "Checking…" : "Ask"}
          </button>
        </div>
      </form>

      <section className="ask-suggestions" aria-label="Suggested questions">
        <h2 className="ask-suggestions__title">Try one of these</h2>
        <ul className="ask-suggestions__list">
          {suggestions.map((q) => (
            <li key={q}>
              <button
                type="button"
                className="ask-suggestions__chip"
                onClick={() => void submit(q)}
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="ask-answer" aria-live="polite">
        {answer.status === "idle" ? (
          <p className="ask-answer__empty">
            Your answer will show up here as a verdict card.
          </p>
        ) : null}

        {answer.status === "loading" ? (
          <p className="ask-answer__empty">Looking at today's demo evidence…</p>
        ) : null}

        {answer.status === "error" ? (
          <p className="ask-answer__error" role="alert">
            {answer.message}
          </p>
        ) : null}

        {answer.status === "ready" ? (
          <div className="ask-answer__ready">
            <p className="ask-answer__question">
              You asked: <span>{answer.question}</span>
            </p>
            <VerdictCard
              verdict={{
                level: answer.verdict.level,
                window: answer.verdict.window,
                reason: answer.verdict.reason,
                aqi: answer.verdict.aqi,
                smallPrint: answer.verdict.small_print,
              }}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
