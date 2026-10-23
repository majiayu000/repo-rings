// Shapes of rings.json (written by extract.ts) and annotations.json (written by the agent).

// h stays short for display; fullHash is absent in older extracted datasets.
export type LogEntry = { h: string; fullHash?: string; s: string; a: string; churn: number };

export type Period = {
  index: number; label: string; start: string; commits: number; added: number; deleted: number;
  authors: number; newAuthors: string[]; sectors: Record<string, { add: number; del: number }>;
  tags: string[]; log: LogEntry[];
};

export type Rings = {
  generator: string;
  repo: { name: string; remote: string | null; head: string; firstCommit: string; lastCommit: string };
  unit: "week" | "month" | "quarter" | "year";
  excludedGenerated: boolean;
  excludedPaths?: string[];
  sectors: { key: string; churn: number }[];
  totals: { commits: number; authors: number; added: number; deleted: number; tags: number };
  authors: { name: string; commits: number; firstPeriod: number; lastPeriod: number }[];
  periods: Period[];
};

export type RingEvent = { period: string; kind: string; title: string; note?: string; evidence?: string[]; angle?: number };

export type Annotations = {
  title: string;
  specimen: { binomial: string; common: string; note: string };
  events: RingEvent[];
  epilogue?: string;
};
