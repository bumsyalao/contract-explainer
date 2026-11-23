import { readFile } from "node:fs/promises";
import path from "node:path";

/** Model names come from .env.example, so scripts never hardcode them. */
export async function envWithModelDefaults(): Promise<NodeJS.ProcessEnv> {
  const text = await readFile(path.join(process.cwd(), ".env.example"), "utf8");
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const line of text.split("\n")) {
    const m = /^([A-Z_]+)=(.+)$/.exec(line.trim());
    if (m && !env[m[1]] && m[1].includes("MODEL")) env[m[1]] = m[2];
  }
  return env;
}
