import type { InterpretedIdea } from "@/lib/types";

export const redditPainSearchPhrases = [
  "how do you handle",
  "is there a tool for",
  "too complicated",
  "I hate",
  "I am tired of",
  "any alternative to",
  "struggling with",
  "what do you use for",
  "pain point",
  "problem",
  "complaint"
] as const;

export type RedditResearchPlan = {
  rewrittenPainTerms: string[];
  queries: string[];
};

const domainLexicon: Record<string, string[]> = {
  记账: ["budgeting app", "expense tracker", "track expenses", "freelancer expenses"],
  预算: ["budgeting app", "expense tracker", "monthly budget", "track expenses"],
  学习: ["study planner", "study schedule", "assignment tracking", "student productivity"],
  文案: ["copywriting workflow", "social media captions", "content ideas", "creator workflow"],
  小红书: ["social media captions", "content planning", "creator workflow", "post ideas"],
  简历: ["resume builder", "job application tracking", "resume feedback", "cover letter"],
  健身: ["workout tracking", "fitness plan", "training log", "exercise routine"],
  饮食: ["meal planning", "nutrition tracking", "protein intake", "diet planning"]
};

export function buildRedditResearchPlan(idea: string, interpretedIdea: InterpretedIdea): RedditResearchPlan {
  const painTerms = inferRedditPainTerms(idea, interpretedIdea);
  const primary = painTerms[0] ?? "workflow";
  const secondary = painTerms[1] ?? primary;
  const target = normalizeEnglishTerm(interpretedIdea.targetUsers[0] ?? painTerms[2] ?? "users");

  return {
    rewrittenPainTerms: painTerms,
    queries: unique([
      `site:reddit.com "${primary}" "too complicated"`,
      `site:reddit.com "how do you handle" "${secondary}"`,
      `site:reddit.com "is there a tool for" "${primary}"`,
      `site:reddit.com "I hate" "${secondary}"`,
      `site:reddit.com "I am tired of" "${secondary}"`,
      `site:reddit.com "any alternative to" "${primary}"`,
      `site:reddit.com "struggling with" "${secondary}"`,
      `site:reddit.com "what do you use for" "${primary}"`,
      `site:reddit.com "${primary}" "pain point"`,
      `site:reddit.com "${primary}" "problem" "${target}"`,
      `site:reddit.com "${primary}" "complaint"`,
      `site:reddit.com "${secondary}" "manual" "${target}"`,
      `site:reddit.com "${secondary}" "spreadsheet"`,
      `site:reddit.com "${secondary}" "Excel"`,
      `site:reddit.com "${secondary}" "Notion"`,
      `site:reddit.com "${primary}" "takes too much time"`
    ]).slice(0, 16)
  };
}

function inferRedditPainTerms(idea: string, interpretedIdea: InterpretedIdea): string[] {
  const zhContext = `${idea} ${interpretedIdea.domain} ${interpretedIdea.keywordsZh.join(" ")}`;
  const lexical = Object.entries(domainLexicon).find(([keyword]) => zhContext.includes(keyword))?.[1] ?? [];
  const english = interpretedIdea.keywordsEn.map(normalizeEnglishTerm).filter(Boolean);
  const painPoints = interpretedIdea.possiblePainPoints.map(toEnglishPainTerm).filter(Boolean);

  return unique([...lexical, ...english, ...painPoints, normalizeEnglishTerm(interpretedIdea.domain)]).slice(0, 8);
}

function normalizeEnglishTerm(value: string) {
  return value
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toEnglishPainTerm(value: string) {
  const lower = value.toLowerCase();

  if (/记账|账单|预算|expense|budget/.test(lower)) return "tracking expenses";
  if (/学习|study|assignment|课程/.test(lower)) return "managing study tasks";
  if (/文案|小红书|caption|content/.test(lower)) return "writing social media captions";
  if (/简历|resume|求职/.test(lower)) return "improving resumes";
  if (/健身|workout|training/.test(lower)) return "tracking workouts";
  if (/饮食|meal|nutrition|protein/.test(lower)) return "planning meals";

  return "";
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
