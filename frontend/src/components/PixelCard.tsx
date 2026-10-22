import { useId, useRef, useState } from "react";
import type { TodayPayload } from "@/types";
import { aqiBand, verdictTone } from "@/lib/verdict";
import { PixelScene } from "./PixelScene";
import "./PixelCard.css";

interface Props {
  today: TodayPayload;
}

function drawCard(
  canvas: HTMLCanvasElement,
  today: TodayPayload,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = 720;
  const h = 420;
  canvas.width = w;
  canvas.height = h;

  const tone = verdictTone(today.level);
  const bg =
    tone === "good" ? "#d5ebe0" : tone === "stay" ? "#f3d4cd" : "#f5e6c0";
  const accent =
    tone === "good" ? "#2f6b4f" : tone === "stay" ? "#a33b2b" : "#b7791f";

  ctx.fillStyle = "#f3f0e7";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(24, 24, w - 48, h - 48);

  ctx.strokeStyle = "#1a2a24";
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, w - 48, h - 48);

  ctx.fillStyle = "#1a2a24";
  ctx.font = "700 42px 'Pixelify Sans', monospace";
  ctx.fillText("haqi", 56, 90);

  ctx.font = "400 22px 'Atkinson Hyperlegible', sans-serif";
  ctx.fillStyle = "#3d5248";
  ctx.fillText(today.location.name, 56, 126);
  ctx.fillText("demo fixture · not live", 56, 154);

  ctx.fillStyle = accent;
  ctx.fillRect(56, 180, 280, 56);
  ctx.fillStyle = "#f3f0e7";
  ctx.font = "700 28px 'Pixelify Sans', monospace";
  ctx.fillText(today.level, 72, 216);

  ctx.fillStyle = "#1a2a24";
  ctx.font = "700 64px 'Pixelify Sans', monospace";
  ctx.fillText(String(today.aqi ?? "—"), 56, 300);
  ctx.font = "400 20px 'Atkinson Hyperlegible', sans-serif";
  ctx.fillStyle = "#3d5248";
  ctx.fillText(`AQI · ${aqiBand(today.aqi)}`, 56, 332);
  ctx.fillText(today.window, 56, 362);

  // pixel sun / haze block as share signature
  ctx.fillStyle = accent;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      if ((x + y) % 2 === 0 || (x > 2 && x < 5 && y > 2 && y < 5)) {
        ctx.fillRect(520 + x * 14, 170 + y * 14, 12, 12);
      }
    }
  }
  ctx.fillStyle = "#1a2a24";
  ctx.font = "700 22px 'Pixelify Sans', monospace";
  ctx.fillText(today.reason.slice(0, 34), 400, 330);
}

export function PixelCard({ today }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const titleId = useId();

  async function downloadCard() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawCard(canvas, today);
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `haqi-${today.level.replace(/\s+/g, "-")}-${today.aqi ?? "x"}.png`;
    a.click();
    setStatus("Card downloaded as PNG.");
  }

  async function shareOrCopy() {
    const summary = `haqi · ${today.location.name}\n${today.level} · AQI ${today.aqi}\n${today.window}\n${today.reason}\n(Demo fixture — not live data)`;
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawCard(canvas, today);

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (blob && navigator.share && navigator.canShare?.({ files: [new File([blob], "haqi.png", { type: "image/png" })] })) {
        await navigator.share({
          title: "haqi air check",
          text: summary,
          files: [new File([blob], "haqi-today.png", { type: "image/png" })],
        });
        setStatus("Shared.");
        return;
      }
    } catch {
      // fall through to clipboard / download
    }

    try {
      await navigator.clipboard.writeText(summary);
      setStatus("Summary copied. You can also download the card.");
    } catch {
      await downloadCard();
      setStatus("Clipboard blocked — downloaded the card instead.");
    }
  }

  return (
    <section className="pixel-card panel" aria-labelledby={titleId}>
      <div className="pixel-card__copy">
        <h2 id={titleId}>Share today's call</h2>
        <p>A pocket-sized pixel card with the verdict and AQI.</p>
      </div>

      <div className="pixel-card__preview" ref={cardRef}>
        <div className="pixel-card__frame">
          <div className="pixel-card__meta">
            <p className="pixel-card__brand">haqi</p>
            <p className={`pixel-card__chip pixel-card__chip--${verdictTone(today.level)}`}>
              {today.level}
            </p>
            <p className="pixel-card__aqi">
              <strong>{today.aqi ?? "—"}</strong>
              <span>AQI</span>
            </p>
            <p className="pixel-card__window">{today.window}</p>
          </div>
          <PixelScene level={today.level} />
        </div>
      </div>

      <div className="pixel-card__actions">
        <button type="button" className="btn btn--primary" onClick={downloadCard}>
          Download PNG
        </button>
        <button type="button" className="btn btn--ghost" onClick={shareOrCopy}>
          Share / copy
        </button>
      </div>
      {status ? (
        <p className="pixel-card__status" role="status">
          {status}
        </p>
      ) : null}
      <canvas ref={canvasRef} className="pixel-card__canvas" aria-hidden="true" />
    </section>
  );
}
