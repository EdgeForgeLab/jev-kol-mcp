export const JEV_QUESTIONS = {
  fit: {
    type: "score",
    instructions:
      "Judge how well this collaboration fits, using the bio and the campaign description. Niche, tone, and a plausible price band must all hold. One clear miss cannot be a strong fit. Use only the given fields. Do not invent follower counts, audience, past rates, or brand partners.",
    criteria: ["Unrelated", "Barely related", "Partial fit", "Strong fit"],
  },
  niche: {
    type: "noul",
    instructions:
      "Are the bio's content niche and the campaign product the same category? True only when both clearly sit in one niche. Adjacent topics, or a product category the bio never supports, are false. Do not treat the absence of a conflict as true.",
  },
  tone: {
    type: "choice",
    instructions:
      "Which tone is closest, based only on the wording of the bio? Choose unknown when the bio is not enough. Do not guess.",
    criteria: {
      review: "Expert review: ingredients, tests, unboxing, pros and cons side by side",
      lifestyle: "Lifestyle: placed in daily life, a vlog, or a real scene",
      tutorial: "Tutorial: steps, a follow-along, teaching someone to do something",
      sincere: "Straightforward recommendation of personal use, without a review or tutorial frame",
      unknown: "The bio is not enough to judge tone",
    },
  },
  price_band: {
    type: "choice",
    instructions:
      "Given the bio's tone and the campaign product, which price band should this creator carry? This is a content-fit inference, not the creator's rate. Choose unknown when there is no basis.",
    criteria: {
      food: "USD 15–80, food and drink",
      everyday: "USD 20–100, everyday goods",
      beauty: "USD 25–120, beauty and skincare",
      fitness: "USD 30–150, fitness and wellness",
      home: "USD 30–200, home and living",
      tech: "USD 80–400, consumer electronics",
      luxury: "USD 200–800, accessible luxury",
      unknown: "The given content is not enough to judge price",
    },
  },
  outreach: {
    type: "noul",
    instructions:
      "Is it worth sending a first collaboration email now? True only when the overall fit is already fairly strong and there is no clear miss. Do not mark true when niche or tone does not fit.",
  },
  mismatch: {
    type: "choice",
    instructions: "If this is not a strong fit, what is the main miss? Choose none for a strong fit.",
    criteria: {
      none: "No clear miss",
      niche: "Niche or product category does not fit",
      tone: "Content tone does not fit how the campaign should be told",
      price: "The fitting price band does not match the campaign assortment",
      evidence: "The bio is too thin to support a collaboration judgment",
    },
  },
} as const;

export const TONE_LABELS: Record<string, { tone: string; note: string }> = {
  review: {
    tone: "Expert review",
    note: "Viewers expect pros and cons. The script should include evidence and limits.",
  },
  lifestyle: {
    tone: "Lifestyle",
    note: "The content sits in a real scene. Show use, and avoid a hard-sell voice.",
  },
  tutorial: {
    tone: "Tutorial",
    note: "Viewers stay to learn one thing. The product has to fit inside the steps.",
  },
  sincere: {
    tone: "Straightforward recommendation",
    note: "Keep it short, specific, and checkable.",
  },
  unknown: {
    tone: "Unknown",
    note: "The bio was not enough, so Jev did not assign a tone.",
  },
};

export const PRICE_BANDS: Record<string, { min: number; max: number; category: string }> = {
  food: { min: 15, max: 80, category: "Food and drink" },
  everyday: { min: 20, max: 100, category: "Everyday goods" },
  beauty: { min: 25, max: 120, category: "Beauty and skincare" },
  fitness: { min: 30, max: 150, category: "Fitness and wellness" },
  home: { min: 30, max: 200, category: "Home and living" },
  tech: { min: 80, max: 400, category: "Consumer electronics" },
  luxury: { min: 200, max: 800, category: "Accessible luxury" },
};

export const MISMATCH_LABELS: Record<string, string> = {
  none: "No clear miss",
  niche: "Niche or product category does not fit",
  tone: "Content tone does not fit",
  price: "Price band does not match the assortment",
  evidence: "The bio is too thin",
};
