import type { VerdictLevel } from "@/types";
import { verdictTone } from "@/lib/verdict";
import "./PixelScene.css";

/** Tiny CSS pixel scene — one sprite language, three verdict moods. */
export function PixelScene({ level }: { level: VerdictLevel }) {
  const tone = verdictTone(level);

  return (
    <div className={`pixel-scene pixel-scene--${tone}`} aria-hidden="true">
      <div className="pixel-scene__sky">
        <span className="pixel-scene__cloud pixel-scene__cloud--a" />
        <span className="pixel-scene__cloud pixel-scene__cloud--b" />
        <span className="pixel-scene__sun" />
      </div>
      <div className="pixel-scene__ground">
        <span className="pixel-scene__tree" />
        <span className="pixel-scene__kid" />
        <span className="pixel-scene__ball" />
      </div>
      <div className="pixel-scene__haze" />
    </div>
  );
}
