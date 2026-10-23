import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Search,
  ChevronDown,
  Bell,
  Share2,
  Download,
  LayoutGrid,
  Map as MapIcon,
  Box,
  BellRing,
  ChartColumn,
  NotebookText,
  Database,
  Settings,
  X,
  ArrowUpRight,
  TrendingUp,
  Flame,
  Droplet,
  Thermometer,
  ArrowUp,
} from "lucide-react";
import worldMap from "@/assets/world-map.jpg";
import miniMap from "@/assets/mini-map.jpg";
import avatar from "@/assets/avatar.jpg";

const K = 1.15;
const W = Math.round(1920 * K);
const H = Math.round(1321 * K);

/* ---------- small building blocks ---------- */

function Dropdown({
  options,
  value,
  onChange,
  muted,
  className = "",
  small,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  muted?: boolean;
  className?: string;
  small?: boolean;
}) {
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
        onClick={() => setOpen((o) => !o)}
        className={`flex h-full w-full items-center justify-between gap-2 rounded-[10px] bg-surface ${
          small ? "px-3 text-[14px]" : "px-5 text-[18px]"
        } ${muted ? "text-ink-faint" : "text-ink"}`}
      >
        <span className="whitespace-nowrap">{value}</span>
        <ChevronDown className={small ? "size-3.5" : "size-4"} strokeWidth={1.5} />
      </button>
      {open && (
        <ul className="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-[10px] bg-surface py-1 shadow-[var(--shadow-soft)]">
          {options.map((o) => (
            <li key={o}>
              <button
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
                className={`block w-full whitespace-nowrap px-4 py-2 text-left text-[15px] hover:bg-canvas ${
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

function Pin({ n, x, y, onClick }: { n: number; x: number; y: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Region ${n}`}
      className="absolute flex flex-col items-center"
      style={{ left: x * K, top: y * K, transform: "translate(-50%,-50%)" }}
    >
      <span className="relative flex size-[58px] items-center justify-center rounded-full bg-surface/30 backdrop-blur-[1px]">
        <span className="absolute -top-1 text-[16px] font-medium text-surface">{n}</span>
        <span className="mt-4 size-[16px] rounded-full bg-surface shadow" />
      </span>
    </button>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[18px] bg-surface ${className}`}>{children}</div>;
}

/* ---------- charts ---------- */

function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function DistributionChart() {
  // bar groups across 718px width, baseline at bottom
  const groups: { color: string; count: number; max: number; min: number }[] = [
    { color: "var(--bar-idle)", count: 10, max: 60, min: 18 },
    { color: "var(--risk-yellow)", count: 9, max: 190, min: 60 },
    { color: "var(--bar-idle)", count: 4, max: 40, min: 16 },
    { color: "var(--risk-red)", count: 16, max: 230, min: 80 },
    { color: "var(--bar-idle)", count: 5, max: 40, min: 16 },
    { color: "var(--risk-teal)", count: 13, max: 120, min: 20 },
    { color: "var(--bar-idle)", count: 13, max: 50, min: 14 },
    { color: "var(--risk-green)", count: 9, max: 120, min: 40 },
    { color: "var(--bar-idle)", count: 10, max: 30, min: 14 },
  ];
  const bars: { c: string; h: number }[] = [];
  let s = 1;
  groups.forEach((g) => {
    for (let i = 0; i < g.count; i++) {
      const mid = 1 - Math.abs(i - g.count * 0.7) / g.count;
      bars.push({ c: g.color, h: g.min + (g.max - g.min) * mid * (0.55 + rand(s++) * 0.45) });
    }
  });
  const gap = 718 / bars.length;
  return (
    <svg viewBox="0 0 718 240" className="h-full w-full" preserveAspectRatio="none">
      {bars.map((b, i) => (
        <rect key={i} x={i * gap + 2} y={240 - b.h} width={2} height={b.h} fill={b.c} rx={1} />
      ))}
    </svg>
  );
}

const ALL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

function TrendChart() {
  const w = 465;
  const h = 170;
  const n = 120;
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const v =
      0.25 +
      0.35 * Math.sin(t * Math.PI * 1.1) +
      0.12 * Math.sin(t * 22) +
      0.05 * Math.sin(t * 57) +
      (t > 0.92 ? (t - 0.92) * 6 : 0);
    pts.push(Math.max(0.02, Math.min(0.95, i === 0 ? 0 : v)));
  }
  const path = pts.map((v, i) => `${i ? "L" : "M"}${(i / (n - 1)) * w},${h - v * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full overflow-visible">
      {Array.from({ length: n }).map((_, i) => {
        const x = (i / (n - 1)) * w;
        const hot = i > 30 && i < 57;
        const bh = (hot ? 0.6 : 0.4 + rand(i) * 0.35) * h * (0.6 + rand(i + 99) * 0.4);
        return (
          <rect
            key={i}
            x={x}
            y={h - bh}
            width={1.4}
            height={bh}
            fill={hot ? "var(--risk-red)" : "var(--bar-idle)"}
            opacity={hot ? 0.75 : 0.7}
          />
        );
      })}
      <path d={path} fill="none" stroke="var(--risk-red)" strokeWidth={1.6} />
      <circle
        cx={200}
        cy={h - 0.66 * h}
        r={8}
        fill="var(--risk-red)"
        stroke="var(--surface)"
        strokeWidth={3}
      />
    </svg>
  );
}

/* ---------- page ---------- */

const REGIONS = [
  { name: "Middle East", level: "High", score: 65 },
  { name: "South Asia", level: "High", score: 78 },
  { name: "Southeast Asia", level: "High", score: 80 },
  { name: "North America", level: "Moderate", score: 35 },
  { name: "South America", level: "Moderate", score: 40 },
];

const NAV = [
  { icon: LayoutGrid, label: "Dashboard" },
  { icon: MapIcon, label: "Risk Map" },
  { icon: Box, label: "Assets" },
  { icon: BellRing, label: "Alerts" },
  { icon: ChartColumn, label: "Reports" },
  { icon: NotebookText, label: "Notes" },
];

export function HomePage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [desktop, setDesktop] = useState(true);
  const [region, setRegion] = useState("All Regions");
  const [assets, setAssets] = useState("All Assets");
  const [riskType, setRiskType] = useState("All Risk Type");
  const [period, setPeriod] = useState("Last 30 Days");
  const [months, setMonths] = useState("12 months");
  const [nav, setNav] = useState(1);
  const [panelOpen, setPanelOpen] = useState(true);
  const [notif, setNotif] = useState(false);
  const [sortDesc, setSortDesc] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const update = () => {
      const w = wrapRef.current?.clientWidth ?? window.innerWidth;
      setDesktop(window.innerWidth >= 1100);
      setScale(w / W);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const regions = REGIONS.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));
  const sorted = sortDesc ? [...regions].sort((a, b) => b.score - a.score) : regions;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast("Link copied to clipboard");
    } catch {
      toast("Couldn't copy the link");
    }
  };
  const exportCsv = () => {
    const csv =
      "Region,Level,Average Risk Score\n" +
      REGIONS.map((r) => `${r.name},${r.level},${r.score}/100`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "world-risk-map.csv";
    a.click();
  };

  // On desktop every block is positioned on the 1920×1321 reference canvas.
  const pos = (l: number, t: number, w: number, h: number) =>
    desktop
      ? { position: "absolute" as const, left: l * K, top: t * K, width: w * K, height: h * K }
      : undefined;

  const content = (
    <>
      {desktop && (
        <img
          src={worldMap}
          alt="Relief world map coloured by risk level"
          width={1920}
          height={1280}
          className="pointer-events-none absolute select-none"
          style={{
            left: -120 * K,
            top: 170 * K,
            width: 1728 * K,
            maskImage: "radial-gradient(ellipse 70% 70% at 50% 50%, black 60%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 70% 70% at 50% 50%, black 60%, transparent 100%)",
          }}
        />
      )}

      {/* Logo */}
      <div style={pos(28, 30, 42, 46)} className="text-ink">
        <svg viewBox="0 0 42 46" className="size-[42px]" fill="currentColor">
          <circle cx="8" cy="8" r="5" />
          <circle cx="24" cy="6" r="5.5" />
          <circle cx="36" cy="16" r="5" />
          <circle cx="18" cy="20" r="6" />
          <circle cx="6" cy="28" r="5" />
          <circle cx="30" cy="30" r="5.5" />
          <circle cx="16" cy="38" r="5" />
        </svg>
      </div>

      {/* Header */}
      <div className={desktop ? "contents" : "flex flex-wrap gap-2"}>
        <label
          style={pos(389, 31, 618, 64)}
          className={`flex items-center gap-4 rounded-[10px] bg-surface px-5 ${desktop ? "" : "h-14 w-full"}`}
        >
          <Search className="size-7 text-ink" strokeWidth={1.4} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full bg-transparent text-[18px] text-ink placeholder:text-ink outline-none"
          />
        </label>
        <div style={pos(1014, 31, 152, 64)} className={desktop ? "" : "h-12"}>
          <Dropdown
            className="h-full"
            value={region}
            onChange={setRegion}
            options={["All Regions", "Europe", "Africa", "Asia", "Middle East", "Americas"]}
          />
        </div>
        <div style={pos(1172, 31, 146, 64)} className={desktop ? "" : "h-12"}>
          <Dropdown
            className="h-full"
            value={assets}
            onChange={setAssets}
            options={["All Assets", "Facilities", "Suppliers", "Warehouses"]}
          />
        </div>
        <div style={pos(1325, 31, 170, 64)} className={desktop ? "" : "h-12"}>
          <Dropdown
            className="h-full"
            muted
            value={riskType}
            onChange={setRiskType}
            options={["All Risk Type", "Wildfire", "Flood", "Water Stress", "Extreme Heat"]}
          />
        </div>
        <div style={pos(1502, 31, 174, 64)} className={desktop ? "" : "h-12"}>
          <Dropdown
            className="h-full"
            muted
            value={period}
            onChange={setPeriod}
            options={["Last 7 Days", "Last 30 Days", "Last 90 Days", "Last 12 Months"]}
          />
        </div>
        <div style={pos(1756, 31, 62, 64)} className={`relative ${desktop ? "" : "h-12 w-12"}`}>
          <button
            onClick={() => setNotif((v) => !v)}
            aria-label="Notifications"
            className="relative flex h-full w-full items-center justify-center rounded-[10px] bg-surface text-ink"
          >
            <Bell className="size-6" strokeWidth={1.4} />
            <span className="absolute right-[18px] top-[15px] size-2.5 rounded-full bg-risk-red" />
          </button>
          {notif && (
            <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-[12px] bg-surface p-4 text-[14px] text-ink-soft shadow-[var(--shadow-soft)]">
              Flood risk increased in Egypt Operations.
            </div>
          )}
        </div>
        <img
          src={avatar}
          alt="Your profile"
          width={64}
          height={64}
          style={pos(1824, 31, 64, 64)}
          className={`rounded-[10px] object-cover ${desktop ? "" : "size-12"}`}
        />
      </div>

      {/* Sidebar */}
      {desktop && (
        <>
          {NAV.map((n, i) => (
            <button
              key={n.label}
              aria-label={n.label}
              onClick={() => setNav(i)}
              style={pos(29, 127 + i * 69, 64, 64)}
              className="flex items-center justify-center rounded-[10px] bg-surface text-ink"
            >
              {nav === i && (
                <span className="absolute -left-[3px] top-[10px] h-[44px] w-[2px] rounded bg-ink" />
              )}
              <n.icon
                className="size-[26px]"
                strokeWidth={nav === i ? 2.4 : 1.4}
                fill={nav === i && i === 1 ? "currentColor" : "none"}
              />
            </button>
          ))}
          <button
            aria-label="Data"
            style={pos(29, 1160, 64, 64)}
            className="flex items-center justify-center rounded-[10px] bg-surface text-ink"
          >
            <Database className="size-[26px]" strokeWidth={1.4} />
          </button>
          <button
            aria-label="Settings"
            style={pos(29, 1229, 64, 64)}
            className="flex items-center justify-center rounded-[10px] bg-surface/60 text-ink-faint"
          >
            <Settings className="size-[26px]" strokeWidth={1.4} />
          </button>
        </>
      )}

      {/* Title */}
      <div style={pos(119, 120, 700, 90)} className={desktop ? "" : "mt-6"}>
        <h1 className="font-display text-[42px] leading-[1.25] tracking-[-0.01em] text-ink">
          World Risk Map
        </h1>
        <p className="mt-1 text-[18px] text-ink-soft">
          Explore environmental risks across your global assets and operations.
        </p>
      </div>
      <button
        onClick={share}
        style={pos(1619, 133, 116, 64)}
        className={`flex items-center justify-center gap-2 rounded-[10px] bg-surface text-[18px] text-ink ${desktop ? "" : "h-12 px-5"}`}
      >
        Share <Share2 className="size-4" strokeWidth={1.6} />
      </button>
      <button
        onClick={exportCsv}
        style={pos(1756, 133, 133, 64)}
        className={`flex items-center justify-center gap-2 rounded-[10px] bg-ink text-[18px] text-surface ${desktop ? "" : "h-12 px-5"}`}
      >
        Export <Download className="size-5" strokeWidth={1.6} />
      </button>

      {/* Pins */}
      {desktop && (
        <>
          <Pin n={1} x={735} y={530} onClick={() => setPanelOpen(true)} />
          <Pin n={2} x={1218} y={330} onClick={() => setPanelOpen(true)} />
          <Pin n={6} x={1250} y={603} onClick={() => setPanelOpen(true)} />
          <Pin n={5} x={735} y={738} onClick={() => setPanelOpen(true)} />
        </>
      )}

      {!desktop && (
        <img
          src={worldMap}
          alt="Relief world map coloured by risk level"
          width={1920}
          height={1280}
          className="mt-6 w-full rounded-[18px]"
        />
      )}

      {/* Egypt panel */}
      {panelOpen && (
        <div style={pos(1365, 365, 445, 443)} className={desktop ? "" : "relative mt-8 h-[560px]"}>
          <button
            onClick={() => setPanelOpen(false)}
            aria-label="Close"
            className="absolute left-1/2 top-0 z-10 flex size-[72px] -translate-x-[15%] items-center justify-center rounded-full bg-surface text-ink shadow-[var(--shadow-soft)] ring-8 ring-canvas/70"
          >
            <X className="size-7" strokeWidth={1.8} />
          </button>
          <Card className="absolute inset-x-0 bottom-0 top-[40px] overflow-hidden bg-surface/90 backdrop-blur">
            <div className="px-[21px] pt-[52px]">
              <div className="flex items-start justify-between border-b border-border pb-3">
                <h3 className="text-[26px] tracking-[-0.01em] text-ink">Egypt Operations</h3>
                <div className="text-right">
                  <div className="text-[15px] text-ink-faint">Overall Risk Score</div>
                  <div className="text-[26px] text-risk-red">
                    85<span className="text-[19px] text-ink-faint">/100</span>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 text-[15px]">
                <div>
                  <div className="flex items-center gap-2 text-ink">
                    <span className="size-2 rounded-full bg-risk-red ring-4 ring-risk-red-soft" />{" "}
                    High Risk
                  </div>
                  <div className="mt-1.5 text-ink-faint">Egypt Operations</div>
                </div>
                <div className="border-l border-border pl-5">
                  <div className="flex items-center gap-2 text-ink">
                    <span className="size-2 rounded-full bg-risk-teal ring-4 ring-canvas" /> Primary
                    Risk
                  </div>
                  <div className="mt-1.5 text-ink-faint">Water Stress</div>
                </div>
                <div className="border-l border-border pl-5">
                  <div className="flex items-center gap-2 text-ink">
                    <TrendingUp className="size-4 text-risk-red" /> Increasing
                  </div>
                  <div className="mt-1.5 text-ink-faint">Trend 3 month</div>
                </div>
              </div>
            </div>
            <img
              src={miniMap}
              alt="Egypt operations location"
              loading="lazy"
              width={1152}
              height={576}
              className="absolute bottom-0 left-0 h-[230px] w-full object-cover object-[60%_40%]"
            />
          </Card>
        </div>
      )}

      {/* Risk Type Distribution */}
      <div
        style={pos(120, 795, 758, 495)}
        className={`rounded-[18px] bg-surface ${desktop ? "" : "mt-6 overflow-x-auto"}`}
      >
        <div className="flex items-start justify-between px-5 pt-5">
          <h3 className="text-[21px] tracking-[-0.01em] text-ink">Risk Type Distribution</h3>
          <button
            aria-label="Open distribution"
            onClick={() => setRiskType("All Risk Type")}
            className="flex size-[50px] items-center justify-center rounded-full border border-border text-ink"
          >
            <ArrowUpRight className="size-5" strokeWidth={1.6} />
          </button>
        </div>
        <div className="mt-[22px] flex justify-between px-5">
          <div>
            <div className="text-[21px] text-ink-faint">Total Assets Monitored</div>
            <div className="mt-1 text-[44px] tracking-[-0.02em] text-ink">1248</div>
          </div>
          <div className="mr-[-18px] grid grid-cols-2 gap-x-[38px] gap-y-[34px] pt-0">
            {[
              {
                icon: <Flame className="size-4 fill-risk-orange text-risk-orange" />,
                l: "Wildfire Exposure",
              },
              {
                icon: <span className="text-[16px] text-risk-red">▲</span>,
                l: "Flood Risk Increased",
              },
              {
                icon: <Droplet className="size-4 fill-risk-teal text-risk-teal" />,
                l: "Water Stress Increasing",
              },
              {
                icon: <Thermometer className="size-4 text-risk-green" />,
                l: "Extreme Heat Detected",
              },
            ].map((s) => (
              <div key={s.l}>
                <div className="flex items-center gap-1.5 text-[19px] text-ink">
                  {s.icon} 32% (398)
                </div>
                <div className="text-[12px] text-ink-faint">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative mx-5 mt-[18px] h-[300px]">
          <DistributionChart />
          {[
            { x: 103, y: 92, c: "bg-risk-orange" },
            { x: 238, y: 100, c: "bg-risk-red" },
            { x: 406, y: 188, c: "bg-risk-teal" },
            { x: 616, y: 118, c: "bg-risk-green" },
          ].map((d) => (
            <span
              key={d.x}
              className={`absolute flex size-4 items-center justify-center rounded-full ${d.c} text-surface`}
              style={{
                left: `calc(${(d.x / 718) * 100}% - 8px)`,
                top: `calc(${(d.y / 230) * 100}% - 8px)`,
              }}
            >
              <ArrowUpRight className="size-2.5" strokeWidth={3} />
            </span>
          ))}
        </div>
      </div>

      {/* Top Risk Regions */}
      <div
        style={pos(888, 898, 455, 392)}
        className={`rounded-[18px] bg-surface ${desktop ? "" : "mt-6"}`}
      >
        <div className="flex items-center justify-between px-[22px] pt-[20px]">
          <h3 className="text-[21px] tracking-[-0.01em] text-ink">Top Risk Regions</h3>
          <button onClick={() => setSortDesc((v) => !v)} className="text-[16px] text-risk-green">
            View Details
          </button>
        </div>
        <div className="mt-[18px] flex justify-between px-[22px] text-[13px] text-ink-faint">
          <span>Region</span>
          <span>Average Risk Score</span>
        </div>
        <ul className="mt-[10px] px-[22px]">
          {sorted.map((r, i) => (
            <li
              key={r.name}
              className={`grid h-[66px] grid-cols-[1fr_auto_1fr] items-center ${i ? "border-t border-border" : "border-t border-border"}`}
            >
              <span className="text-[18px] text-ink">{r.name}</span>
              <span
                className={`rounded-full px-2.5 py-1 text-[13px] ${r.level === "High" ? "bg-risk-red-soft text-risk-red" : "bg-risk-orange-soft text-risk-orange"}`}
              >
                {r.level}
              </span>
              <span className="text-right text-[16px] text-ink">
                {r.score}
                <span className="text-[13px] text-ink-soft">/100</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Risk Trend */}
      <div
        style={pos(1355, 898, 533, 392)}
        className={`rounded-[18px] bg-surface ${desktop ? "" : "mt-6"}`}
      >
        <div className="flex items-center justify-between px-[21px] pt-[22px]">
          <h3 className="text-[21px] tracking-[-0.01em] text-ink">Risk Trend (All Assets)</h3>
          <Dropdown
            small
            className="h-[38px] rounded-[10px] border border-border"
            value={months}
            onChange={setMonths}
            options={["3 months", "6 months", "12 months"]}
          />
        </div>
        <div className="relative mt-[50px] h-[260px] px-[21px]">
          <div className="absolute left-[21px] top-0 flex h-[220px] flex-col justify-between text-[13px] text-ink-soft">
            {["100", "70", "50", "25", "0"].map((l) => (
              <span key={l} className="leading-none">
                {l}
              </span>
            ))}
          </div>
          <div className="absolute left-[48px] right-[20px] top-[48px] h-[180px]">
            <TrendChart />
          </div>
          <div className="absolute left-[188px] top-[-6px] rounded-[8px] bg-surface px-2 py-1 text-[10px] leading-[1.9] text-ink-faint shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-risk-red" />
              Risk Up <span className="text-ink">12.6%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-bar-idle" />
              Over <span className="text-ink">90 Days</span>
            </div>
          </div>
          <div className="absolute bottom-0 left-[38px] right-[21px] flex justify-between text-[13px] text-ink-soft">
            {ALL_MONTHS.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
        <div className="mt-[34px] flex gap-[38px] px-[30px] text-[13px] text-ink">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-risk-red" /> Risk exposure increased{" "}
            <span className="ml-2 flex items-center text-[16px] text-risk-red">
              80% <ArrowUp className="size-3.5" />
            </span>
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-risk-red" /> Average Risk Score{" "}
            <span className="ml-2 flex items-center text-[16px] text-risk-red">
              68/100 <ArrowUp className="size-3.5" />
            </span>
          </span>
        </div>
      </div>
    </>
  );

  return (
    <div ref={wrapRef} className="min-h-screen w-full bg-canvas">
      {desktop ? (
        <div style={{ height: H * scale }} className="overflow-hidden">
          <div
            className="relative origin-top-left overflow-hidden bg-canvas"
            style={{ width: W, height: H, transform: `scale(${scale})` }}
          >
            {content}
          </div>
        </div>
      ) : (
        <div className="px-4 py-6">{content}</div>
      )}
    </div>
  );
}
