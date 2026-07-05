export type TranscriptRole = "advocate" | "opposition";

export type TranscriptEntry = {
  role: TranscriptRole;
  text: string;
  citation?: string;
};

export const heroTranscript: TranscriptEntry[] = [
  {
    role: "advocate",
    text: "The denial cites medical necessity, but the policy's imaging clause explicitly covers physician-directed MRI when clinically justified.",
    citation: "POLICY §4.2.1",
  },
  {
    role: "opposition",
    text: "Our review found insufficient internal criteria for pre-authorization approval under standard utilization management.",
    citation: "CASE LOG 000731",
  },
  {
    role: "advocate",
    text: "That position conflicts with the claim letter's own timeline and fails to identify a clause-based exclusion that would override coverage.",
    citation: "CAL. INS. §796.04",
  },
  {
    role: "opposition",
    text: "We can re-open the file for expedited review if additional evidence is submitted through the formal channel.",
    citation: "A2A TASK // RESPONSE",
  },
];

export const heroTrustStats = [
  { label: "$2.1M+ RECOVERED", value: 2_100_000 },
  { label: "11 DAY AVG. RESOLUTION", value: 11 },
  { label: "A2A PROTOCOL NATIVE", value: 1 },
];
