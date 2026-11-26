import { handleAnalyzeText } from "@/lib/api/handlers";
import { createProvider, DEFAULT_PROVIDER } from "@/lib/llm";

export const maxDuration = 60;

export async function POST(request: Request) {
  return handleAnalyzeText(request, () => createProvider(DEFAULT_PROVIDER));
}
