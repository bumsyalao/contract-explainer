import cache from "@/samples/freelance-agreement.cache.json";

/**
 * The stored result for the synthetic sample, so the public demo needs no live
 * model calls. Regenerate with scripts/build-sample-cache.ts. A test checks it
 * still matches the sample PDF.
 */
export const SAMPLE_CACHE = cache;

export function handleSample(): Response {
  // The data is static and public (synthetic), so it can be cached.
  return Response.json(SAMPLE_CACHE, { headers: { "Cache-Control": "public, max-age=3600" } });
}
