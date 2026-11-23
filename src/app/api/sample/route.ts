import { handleSample } from "@/lib/api/sample";

export async function GET() {
  return handleSample();
}
