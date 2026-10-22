export function AboutPage() {
  return (
    <div className="about-page">
      <header className="page-head">
        <p className="page-kicker">About</p>
        <h1 className="page-title">haqi</h1>
        <p className="page-lede">
          Healthy Air Quality Intelligence — built so a 14-year-old can ask “can I
          play outside?” and understand the answer in one glance, plus see why.
        </p>
      </header>

      <section className="panel" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontFamily: "var(--font-display)", marginTop: 0 }}>
          How to read haqi
        </h2>
        <ul>
          <li>
            <strong>Ask</strong> — type a plan; get a verdict card (not a chat
            transcript).
          </li>
          <li>
            <strong>Today</strong> — the daily call, measurements, and a shareable
            pixel card.
          </li>
          <li>
            <strong>Why?</strong> — the evidence graph behind the call.
          </li>
        </ul>
        <p>
          Three verdict colors: <em>good to go</em>, <em>be careful</em>,{" "}
          <em>stay in</em>. Blind spots are always shown in plain words.
        </p>
        <p style={{ color: "var(--ink-soft)", marginBottom: 0 }}>
          Icons by Streamline. Demo fixtures are illustrative — not live verified
          readings for Lagos.
        </p>
      </section>
    </div>
  );
}
