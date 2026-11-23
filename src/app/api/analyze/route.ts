import { handleAnalyze } from "@/lib/api/handlers";
import { createProvider, DEFAULT_PROVIDER } from "@/lib/llm";

// Two model calls plus retries can take a while on a free tier.
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleAnalyze(request, () => createProvider(DEFAULT_PROVIDER));
}
