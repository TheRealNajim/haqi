/**
 * Ask-page fixtures.
 *
 * Everything here is deterministic demo data: the UI renders the same answer
 * for the same question. Swap `askHaqi` for a real API call later without
 * touching the composer or answer components.
 */

export type CapabilityId = "analyze" | "ask" | "why" | "sources";

export type Capability = {
  id: CapabilityId;
  title: string;
  description: string;
  prompts: string[];
};

export const CAPABILITIES: Capability[] = [
  {
    id: "analyze",
    title: "Analyze Data",
    description:
      "Compare air quality across locations, explore patterns, and understand changes in environmental conditions.",
    prompts: [
      "Compare air quality across three Nigerian cities.",
      "Which locations have the highest AQI?",
      "What patterns can we see in these readings?",
    ],
  },
  {
    id: "ask",
    title: "Ask Questions",
    description:
      "Get clear, accessible answers about air quality, pollutants, health, and the environment.",
    prompts: [
      "What does today's AQI mean?",
      "How does poor air quality affect people with asthma?",
      "Is it better to exercise outdoors when air quality is poor?",
    ],
  },
  {
    id: "why",
    title: "Understand Why",
    description:
      "Explore possible pollution sources, environmental factors, and the evidence behind air-quality conditions.",
    prompts: [
      "Why might air quality be poor in this area?",
      "How can weather affect pollution?",
      "What factors could explain differences between cities?",
    ],
  },
  {
    id: "sources",
    title: "Find Sources",
    description:
      "Trace the readings and sources behind an answer, and see what the demo cannot confirm.",
    prompts: [
      "Where does this AQI reading come from?",
      "Which sources support this answer?",
      "How uncertain is this conclusion?",
    ],
  },
];

export type Tone = "red" | "orange" | "teal" | "green" | "neutral";

export type AnswerMetric = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
};

export type AnswerBar = {
  label: string;
  value: number;
  display: string;
  tone: Tone;
};

export type AnswerComparison = {
  title: string;
  caption: string;
  max: number;
  bars: AnswerBar[];
};

export type AnswerSection = {
  heading: string;
  kind: "observed" | "hypothesis" | "context";
  body: string;
  bullets?: string[];
};

export type DemoAnswer = {
  title: string;
  verdict: string;
  verdictTone: Tone;
  summary: string;
  metrics: AnswerMetric[];
  comparison?: AnswerComparison;
  sections: AnswerSection[];
  followUps: string[];
  provenance: {
    label: string;
    window: string;
    note: string;
  };
};

export type AskRequest = {
  question: string;
};

/** Simulated "thinking" pause, kept here so a real API can own its own timing. */
export const DEMO_LATENCY_MS = 650;

export async function askHaqi({ question }: AskRequest): Promise<DemoAnswer> {
  await new Promise((resolve) => setTimeout(resolve, DEMO_LATENCY_MS));
  return getDemoAnswer(question);
}

const SNAPSHOT = "23 Oct 2026 · 09:40 WAT";

function provenance(window: string, note: string): DemoAnswer["provenance"] {
  return { label: "Demo fixture · not live data", window, note };
}

const cityBars: AnswerBar[] = [
  { label: "Lagos", value: 82, display: "82", tone: "orange" },
  { label: "Abuja", value: 64, display: "64", tone: "green" },
  { label: "Port Harcourt", value: 96, display: "96", tone: "red" },
];

function compareCities(): DemoAnswer {
  return {
    title: "Lagos, Abuja and Port Harcourt, side by side",
    verdict: "Mixed",
    verdictTone: "orange",
    summary:
      "Port Harcourt has the highest demo AQI at 96, while Abuja is the cleanest of the three at 64. The 32-point gap is wide enough to change the advice: sensitive groups should take more care in Port Harcourt.",
    metrics: [
      { label: "Highest AQI", value: "96", detail: "Port Harcourt", tone: "red" },
      { label: "Lowest AQI", value: "64", detail: "Abuja", tone: "green" },
      { label: "Spread", value: "32", detail: "AQI points across the three", tone: "orange" },
    ],
    comparison: {
      title: "Average AQI · demo snapshot",
      caption: "Higher means more pollution. All three values are sample data.",
      max: 120,
      bars: cityBars,
    },
    sections: [
      {
        heading: "What the numbers show",
        kind: "observed",
        body: "All three cities sit above the cleanest band. Lagos and Port Harcourt are close to the point where sensitive groups may notice symptoms.",
      },
      {
        heading: "Possible explanations",
        kind: "hypothesis",
        body: "These are plausible causes, not measured ones.",
        bullets: [
          "Port Harcourt's port and industrial activity may add fine particles.",
          "Lagos traffic density is a likely contributor, but one snapshot cannot separate traffic from weather.",
          "Abuja's lower reading could reflect more open space and less industrial activity.",
        ],
      },
      {
        heading: "How to read the index",
        kind: "context",
        body: "AQI is a summary index, not a pollutant reading. In this demo, PM2.5 is the pollutant driving the values.",
      },
    ],
    followUps: [
      "Which locations have the highest AQI?",
      "What patterns can we see in these readings?",
      "How can weather affect pollution?",
    ],
    provenance: provenance(
      "24-hour rolling sample",
      "Illustrative readings generated for the interface. Not connected to a monitor network.",
    ),
  };
}

function highestAqi(): DemoAnswer {
  return {
    title: "Highest demo AQI readings",
    verdict: "Moderate, near the limit",
    verdictTone: "orange",
    summary:
      "Port Harcourt (96), Kano (91) and Lagos (82) lead this demo snapshot. All three are still in the Moderate band, but Port Harcourt sits closest to the sensitive-groups threshold.",
    metrics: [
      { label: "Highest AQI", value: "96", detail: "Port Harcourt", tone: "red" },
      { label: "Above 80", value: "3 of 8", detail: "Locations in this sample", tone: "orange" },
      { label: "Cleanest", value: "56", detail: "Enugu", tone: "green" },
    ],
    comparison: {
      title: "Top three by AQI",
      caption: "Sample readings from eight Nigerian locations.",
      max: 110,
      bars: [
        { label: "Port Harcourt", value: 96, display: "96", tone: "red" },
        { label: "Kano", value: 91, display: "91", tone: "orange" },
        { label: "Lagos", value: 82, display: "82", tone: "orange" },
        { label: "Enugu", value: 56, display: "56", tone: "green" },
      ],
    },
    sections: [
      {
        heading: "What stands out",
        kind: "observed",
        body: "The top three cluster within 14 AQI points of each other. Enugu is the only location in the sample that sits comfortably in the lower half of the Moderate band.",
      },
      {
        heading: "What could push a city higher",
        kind: "hypothesis",
        body: "Traffic, generator use, industry and dust can all raise particulate levels. This snapshot does not identify which one is responsible.",
      },
      {
        heading: "What the ranking hides",
        kind: "context",
        body: "A city average can mask a much worse neighbourhood near a road, port or industrial site. Treat the list as a starting point, not a verdict on every street.",
      },
    ],
    followUps: [
      "Compare air quality across three Nigerian cities.",
      "What patterns can we see in these readings?",
      "What factors could explain differences between cities?",
    ],
    provenance: provenance(
      "24-hour rolling sample",
      "Ranking built from eight fixed demo readings, not live monitors.",
    ),
  };
}

function patterns(): DemoAnswer {
  return {
    title: "A morning peak, then a slow dip",
    verdict: "Pattern found",
    verdictTone: "teal",
    summary:
      "Demo readings climb between 07:00 and 09:00, ease through the afternoon, then rise again after 18:00. The morning peak is the most consistent pattern across the 14 sample days.",
    metrics: [
      { label: "Morning peak", value: "07–09", detail: "Highest average AQI", tone: "orange" },
      { label: "Evening rise", value: "+18%", detail: "Against the afternoon", tone: "orange" },
      { label: "Days sampled", value: "14", detail: "Same demo location", tone: "neutral" },
    ],
    comparison: {
      title: "Average AQI by time of day",
      caption: "Fourteen days of sample readings, grouped into four windows.",
      max: 100,
      bars: [
        { label: "00:00–06:00", value: 48, display: "48", tone: "green" },
        { label: "07:00–09:00", value: 84, display: "84", tone: "red" },
        { label: "10:00–16:00", value: 61, display: "61", tone: "orange" },
        { label: "17:00–20:00", value: 77, display: "77", tone: "orange" },
        { label: "21:00–24:00", value: 55, display: "55", tone: "green" },
      ],
    },
    sections: [
      {
        heading: "What repeats",
        kind: "observed",
        body: "The same shape appears on most weekdays: a sharp rise after sunrise, a gradual fall, then a second smaller rise in the evening. Weekends are flatter in the sample.",
      },
      {
        heading: "Possible reasons",
        kind: "hypothesis",
        body: "Rush-hour traffic, cooking, and backup generators are all plausible contributors. Cool, still mornings can also keep pollution close to the ground.",
      },
      {
        heading: "What this cannot tell you",
        kind: "context",
        body: "A repeating pattern is not proof of a cause. Confirming it would need source measurements and more than 14 days of data.",
      },
    ],
    followUps: [
      "Compare air quality across three Nigerian cities.",
      "Which locations have the highest AQI?",
      "Why might air quality be poor in this area?",
    ],
    provenance: provenance(
      "14-day demo sample",
      "A fixed synthetic series used to demonstrate change-over-time views.",
    ),
  };
}

function aqiMeaning(): DemoAnswer {
  return {
    title: "What today's AQI of 82 means",
    verdict: "Moderate",
    verdictTone: "orange",
    summary:
      "An AQI of 82 is in the Moderate band. The air is acceptable for most people, but sensitive groups — people with asthma, young children, and older adults — may notice mild effects.",
    metrics: [
      { label: "Today's AQI", value: "82", detail: "Demo reading", tone: "orange" },
      { label: "Band", value: "Moderate", detail: "AQI 51–100", tone: "orange" },
      { label: "Main pollutant", value: "PM2.5", detail: "Fine particles", tone: "neutral" },
    ],
    sections: [
      {
        heading: "Think of AQI as a scale",
        kind: "context",
        body: "Lower is cleaner. The index turns pollutant measurements into one number so it is easier to compare places and times. It is not a count of particles in the air.",
      },
      {
        heading: "What it means for you",
        kind: "observed",
        body: "Most people can go about a normal day. If you are sensitive to air pollution, consider taking it easier during the morning peak and watch for coughing, wheezing or a tight chest.",
        bullets: [
          "0–50: air is clean for almost everyone.",
          "51–100: acceptable for most; sensitive groups may notice mild effects.",
          "101–150: sensitive groups should reduce prolonged outdoor exertion.",
          "151+: everyone should cut back on strenuous outdoor activity.",
        ],
      },
      {
        heading: "What the number hides",
        kind: "context",
        body: "A single city reading can miss a busy road or industrial area nearby. PM2.5 is the pollutant driving this demo value.",
      },
    ],
    followUps: [
      "How does poor air quality affect people with asthma?",
      "Is it better to exercise outdoors when air quality is poor?",
      "What patterns can we see in these readings?",
    ],
    provenance: provenance(
      "24-hour demo snapshot",
      "AQI bands follow the common 0–500 scale. The value itself is sample data.",
    ),
  };
}

function asthma(): DemoAnswer {
  return {
    title: "How poor air quality affects asthma",
    verdict: "Higher risk",
    verdictTone: "red",
    summary:
      "Fine particles and other pollutants can irritate the airways, making them inflamed and narrower. For someone with asthma, that can mean more coughing, wheezing and shortness of breath — especially during exercise or long periods outdoors.",
    metrics: [
      {
        label: "Main irritant",
        value: "PM2.5",
        detail: "Particles small enough to reach deep lungs",
        tone: "red",
      },
      {
        label: "At-risk group",
        value: "Asthma",
        detail: "Also children and older adults",
        tone: "orange",
      },
      {
        label: "Best defence",
        value: "Exposure",
        detail: "Reduce time and effort outdoors",
        tone: "green",
      },
    ],
    sections: [
      {
        heading: "What happens in the body",
        kind: "observed",
        body: "Pollution particles trigger irritation in the airways. The body responds with inflammation and extra mucus, and the muscles around the airways can tighten. That is why breathing can feel harder.",
        bullets: [
          "Symptoms may appear within hours of exposure.",
          "Exercise matters because you breathe faster and take pollution deeper into the lungs.",
          "Effects vary widely from person to person.",
        ],
      },
      {
        heading: "When to be extra careful",
        kind: "context",
        body: "Pay more attention when the AQI is above 100, when there is visible haze or smoke, during rush hour, and on still mornings when pollution stays close to the ground.",
      },
      {
        heading: "Practical steps",
        kind: "observed",
        body: "Check the AQI before going out, prefer quieter streets away from traffic, keep reliever medication close, and move activity indoors if symptoms start. This is general information, not medical advice.",
      },
    ],
    followUps: [
      "What does today's AQI mean?",
      "Is it better to exercise outdoors when air quality is poor?",
      "How can weather affect pollution?",
    ],
    provenance: provenance(
      "Static demo knowledge",
      "Plain-language summary prepared for the prototype. Not a clinical guideline.",
    ),
  };
}

function exercise(): DemoAnswer {
  return {
    title: "Should you exercise outdoors when air is poor?",
    verdict: "It depends",
    verdictTone: "orange",
    summary:
      "Short, easy activity is usually fine when the AQI is Moderate (51–100). When it climbs above 100 — or you can see haze or smell smoke — move the workout indoors or keep it light.",
    metrics: [
      {
        label: "Moderate band",
        value: "51–100",
        detail: "Usually fine for most people",
        tone: "orange",
      },
      {
        label: "Better window",
        value: "Early",
        detail: "Before the demo morning peak",
        tone: "green",
      },
      {
        label: "Avoid",
        value: "07–09",
        detail: "Busiest traffic window in the sample",
        tone: "red",
      },
    ],
    sections: [
      {
        heading: "Use this rule of thumb",
        kind: "observed",
        body: "Match the effort to the reading rather than skipping exercise altogether.",
        bullets: [
          "Under 50: outdoor exercise is a good choice.",
          "51–100: fine for most; sensitive groups should keep it lighter.",
          "101–150: reduce long or hard sessions outdoors.",
          "Above 150: move exercise indoors if you can.",
        ],
      },
      {
        heading: "Why timing matters",
        kind: "observed",
        body: "The demo series peaks between 07:00 and 09:00, when traffic is heavy. A quieter side street or a park away from main roads can make more difference than a small change in the AQI number.",
      },
      {
        heading: "Why breathing harder matters",
        kind: "context",
        body: "Exercise increases how much air you move and how deeply it reaches your lungs. That is helpful when the air is clean, but it also increases exposure when it is not.",
      },
    ],
    followUps: [
      "What does today's AQI mean?",
      "How does poor air quality affect people with asthma?",
      "What patterns can we see in these readings?",
    ],
    provenance: provenance(
      "Static demo knowledge",
      "General guidance for the prototype, not personalised health advice.",
    ),
  };
}

function poorArea(): DemoAnswer {
  return {
    title: "Why air quality may be poor here",
    verdict: "Multiple factors",
    verdictTone: "orange",
    summary:
      "This demo snapshot points to traffic and generator fumes as the most likely local contributors, with dust from dry winds as a possible add-on. Those are hypotheses: the fixture does not include source measurements.",
    metrics: [
      {
        label: "Most likely",
        value: "Traffic",
        detail: "Hypothesis, not measured",
        tone: "orange",
      },
      {
        label: "Also possible",
        value: "Generators",
        detail: "Common local source",
        tone: "orange",
      },
      { label: "Confidence", value: "Low", detail: "No source data in this demo", tone: "neutral" },
    ],
    sections: [
      {
        heading: "What the fixture shows",
        kind: "observed",
        body: "The demo AQI is 82, with PM2.5 as the dominant pollutant. Winds are light and the reading rises in the evening, which is consistent with pollution staying close to the ground.",
      },
      {
        heading: "Possible sources",
        kind: "hypothesis",
        body: "These explanations fit the pattern but are not confirmed by this dataset.",
        bullets: [
          "Road traffic, especially at rush hour and along major corridors.",
          "Backup generators running during working hours.",
          "Open burning of waste or cooking with solid fuel.",
          "Dust carried in by dry, windy conditions.",
        ],
      },
      {
        heading: "How sure can we be?",
        kind: "context",
        body: "Not very, from one snapshot. Confirming a source needs repeated readings, wind data and source apportionment — measurements that separate the contribution of traffic, dust and industry.",
      },
    ],
    followUps: [
      "How can weather affect pollution?",
      "What factors could explain differences between cities?",
      "Compare air quality across three Nigerian cities.",
    ],
    provenance: provenance(
      "24-hour demo snapshot",
      "Observed values are sample data. Source explanations are explicitly unconfirmed.",
    ),
  };
}

function weather(): DemoAnswer {
  return {
    title: "How weather moves pollution around",
    verdict: "Weather shapes exposure",
    verdictTone: "teal",
    summary:
      "Weather usually does not create pollution, but it decides where pollution goes and how long it stays. Wind spreads it, rain washes particles out, and still air can trap it near the ground.",
    metrics: [
      { label: "Wind", value: "Spreads", detail: "Moves pollution downwind", tone: "teal" },
      { label: "Rain", value: "Washes", detail: "Pulls particles out of the air", tone: "green" },
      {
        label: "Still air",
        value: "Traps",
        detail: "Keeps pollution close to the ground",
        tone: "red",
      },
    ],
    sections: [
      {
        heading: "The three main effects",
        kind: "observed",
        body: "The same amount of pollution can produce very different readings depending on the weather.",
        bullets: [
          "Wind dilutes pollution, but can carry it into another neighbourhood.",
          "Rain removes larger particles and some gases from the air.",
          "A temperature inversion acts like a lid, trapping cooler, dirtier air below warmer air.",
          "Strong sunlight can cook some pollutants into ozone.",
        ],
      },
      {
        heading: "What this means for a bad-air day",
        kind: "hypothesis",
        body: "A still, hazy morning is more likely to be a trapped-pollution day than a windy one. Evening calm can have the same effect after a busy day of traffic.",
      },
      {
        heading: "What weather cannot explain",
        kind: "context",
        body: "Weather moves and concentrates pollution; it does not remove the need to look at emissions. A clean, windy day can still have a local hotspot beside a busy road.",
      },
    ],
    followUps: [
      "Why might air quality be poor in this area?",
      "What factors could explain differences between cities?",
      "What patterns can we see in these readings?",
    ],
    provenance: provenance(
      "Static demo knowledge",
      "General explanation for the prototype. No live weather feed is connected.",
    ),
  };
}

function differences(): DemoAnswer {
  return {
    title: "Why cities can read differently",
    verdict: "Several drivers",
    verdictTone: "orange",
    summary:
      "The demo gap between Lagos (82), Abuja (64) and Port Harcourt (96) is too large to explain with weather alone. Traffic density, industry, geography and where monitors sit are all plausible factors.",
    metrics: [
      {
        label: "Largest gap",
        value: "32",
        detail: "AQI points, Abuja to Port Harcourt",
        tone: "orange",
      },
      { label: "Cities compared", value: "3", detail: "Demo snapshot", tone: "neutral" },
      {
        label: "Strongest clue",
        value: "Traffic",
        detail: "Hypothesis, not confirmed",
        tone: "orange",
      },
    ],
    comparison: {
      title: "Average AQI · demo snapshot",
      caption: "A wide gap points to local conditions, not just regional weather.",
      max: 120,
      bars: cityBars,
    },
    sections: [
      {
        heading: "What the snapshot shows",
        kind: "observed",
        body: "Port Harcourt is 14 points above Lagos and 32 above Abuja. A gap of that size is unlikely to come from measurement noise alone.",
      },
      {
        heading: "Possible explanations",
        kind: "hypothesis",
        body: "Each of these could contribute; this demo cannot rank them.",
        bullets: [
          "Traffic density and the age of the vehicle fleet.",
          "Port, industrial and construction activity.",
          "Geography and coastline, which affect how quickly pollution disperses.",
          "Monitor placement: a site near a road reads higher than a park.",
        ],
      },
      {
        heading: "What would settle it",
        kind: "context",
        body: "Repeated readings at matched sites, wind data and source apportionment would separate real differences from the effect of where each monitor sits.",
      },
    ],
    followUps: [
      "Compare air quality across three Nigerian cities.",
      "Which locations have the highest AQI?",
      "Why might air quality be poor in this area?",
    ],
    provenance: provenance(
      "24-hour demo snapshot",
      "Three fixed sample values chosen to demonstrate comparison. Causes are unconfirmed.",
    ),
  };
}

function sources(): DemoAnswer {
  return {
    title: "Where this answer comes from",
    verdict: "Demo provenance",
    verdictTone: "teal",
    summary:
      "Every answer in this prototype is assembled locally from fixtures. The evidence chain names a nearby demo station, a wind forecast, and one stale school sensor that is deliberately counted less.",
    metrics: [
      { label: "Primary reading", value: "61", detail: "PM2.5 µg/m³, 3.8 km away", tone: "orange" },
      {
        label: "Evidence items",
        value: "3",
        detail: "Station, forecast, second sensor",
        tone: "neutral",
      },
      {
        label: "Down-weighted",
        value: "1",
        detail: "Stale sensor, counted at 21%",
        tone: "orange",
      },
    ],
    sections: [
      {
        heading: "What is attached",
        kind: "observed",
        body: "The demo answer carries three pieces of evidence and one recorded gap.",
        bullets: [
          "Station 3.8 km away: PM2.5 61 µg/m³, marked steady.",
          "Wind forecast: a breeze is expected to turn at noon and clear smoke.",
          "School sensor: read 71 this morning, but the reading is old.",
        ],
      },
      {
        heading: "How the weighting works",
        kind: "context",
        body: "Weights are a rough measure of influence, not a probability. The primary station carries 82%, the forecast 55%, and the stale sensor only 21%. A stale reading is still shown, never hidden.",
      },
      {
        heading: "What is still missing",
        kind: "hypothesis",
        body: "There is no satellite pass for distant smoke, so the answer cannot rule out a source outside the station's neighbourhood. That gap is listed under blind spots on the Why page.",
      },
    ],
    followUps: [
      "How uncertain is this conclusion?",
      "Why might air quality be poor in this area?",
      "What does today's AQI mean?",
    ],
    provenance: provenance(
      "Demo evidence chain",
      "Source names and weights mirror fixtures/why.json. No live monitor or weather feed is connected.",
    ),
  };
}

function uncertainty(): DemoAnswer {
  return {
    title: "How sure is this answer?",
    verdict: "Medium confidence",
    verdictTone: "orange",
    summary:
      "Confidence is limited but not low. One steady station reading does most of the work, a forecast adds context, and a stale sensor is down-weighted. The missing satellite pass is the biggest unresolved gap.",
    metrics: [
      { label: "Primary station", value: "82%", detail: "Steady PM2.5 reading", tone: "teal" },
      { label: "Forecast", value: "55%", detail: "Clearing trend, not proof", tone: "orange" },
      { label: "Stale sensor", value: "21%", detail: "Old reading, counted less", tone: "neutral" },
    ],
    sections: [
      {
        heading: "What raises confidence",
        kind: "observed",
        body: "The primary station is close, its reading is steady, and it agrees with the general pattern of a still morning followed by a breeze.",
      },
      {
        heading: "What lowers it",
        kind: "hypothesis",
        body: "The wind forecast is a prediction, not an observation. The second sensor is hours old, and no satellite pass was available to check for smoke coming from further away.",
        bullets: [
          "No source measurements to separate traffic, dust and burning.",
          "One nearby station cannot represent a whole neighbourhood.",
          "Forecast timing can shift without much warning.",
        ],
      },
      {
        heading: "What would change the answer",
        kind: "context",
        body: "A fresh second reading, a satellite pass, or wind measurements at ground level would either strengthen the call or move the best window later.",
      },
    ],
    followUps: [
      "Which sources support this answer?",
      "Why might air quality be poor in this area?",
      "How can weather affect pollution?",
    ],
    provenance: provenance(
      "Demo confidence estimate",
      "Weights are illustrative, not statistical probabilities. The same question always returns this explanation.",
    ),
  };
}

function fallback(question: string): DemoAnswer {
  const allPrompts = CAPABILITIES.flatMap((capability) => capability.prompts);

  return {
    title: "A starting point for that question",
    verdict: "Demo fallback",
    verdictTone: "neutral",
    summary: `This demo does not have a scripted answer for that exact wording. Your question was: “${question.trim()}”.`,
    metrics: [
      { label: "Coverage", value: "12 prompts", detail: "Four capabilities", tone: "neutral" },
      { label: "Data source", value: "Fixtures", detail: "No live connection", tone: "neutral" },
      { label: "Behaviour", value: "Fixed", detail: "Same question, same answer", tone: "neutral" },
    ],
    sections: [
      {
        heading: "What this demo can answer",
        kind: "context",
        body: "Name a city, a pollutant, a health condition, a weather effect or a source, and the demo will return a prepared plain-language answer. The full list of suggested questions is below.",
        bullets: allPrompts,
      },
    ],
    followUps: [
      "What does today's AQI mean?",
      "Where does this AQI reading come from?",
      "Why might air quality be poor in this area?",
    ],
    provenance: provenance(
      "Static demo fallback",
      `No scripted fixture matched “${question.trim()}”. The same question always returns this response.`,
    ),
  };
}

export function getDemoAnswer(question: string): DemoAnswer {
  const normalised = question.toLowerCase();

  // Most specific topics first so a question such as "why is the air poor for
  // people with asthma?" resolves to health rather than the generic why answer.
  if (/\b(asthma|lung|breath|health|sensitive)\b/.test(normalised)) return asthma();
  if (/\b(exercise|run|running|outdoor|sport|play|workout)\b/.test(normalised)) return exercise();
  if (/\b(uncertain|uncertainty|confiden\w*|how sure|reliab\w*)\b/.test(normalised))
    return uncertainty();
  if (/\b(sources?|evidence|support|come from|provenance|where does)\b/.test(normalised))
    return sources();
  if (/\b(weather|wind|rain|temperature|harmattan|humid)\b/.test(normalised)) return weather();
  if (/\b(differences?|different|cities|city|factors?)\b/.test(normalised)) return differences();
  if (/\b(why|poor|smoke|haze|pollut\w*|dirty)\b/.test(normalised)) return poorArea();
  if (/\b(compare|comparison|three|versus|vs)\b/.test(normalised)) return compareCities();
  if (/\b(highest|worst|most polluted|rank|top)\b/.test(normalised)) return highestAqi();
  if (/\b(patterns?|trends?|changes?|readings?|time of day|when)\b/.test(normalised))
    return patterns();
  if (/\b(aqi|mean|today|reading)\b/.test(normalised)) return aqiMeaning();
  return fallback(question);
}

/** Fixed snapshot label used in the answer footer. */
export const DEMO_SNAPSHOT = SNAPSHOT;
