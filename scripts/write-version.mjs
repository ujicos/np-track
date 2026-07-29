import { writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

function gitValue(command, fallback) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim() || fallback;
  } catch {
    return fallback;
  }
}

const commit =
  process.env.GITHUB_SHA ||
  gitValue("git rev-parse --short=12 HEAD", "local");
const builtAt = new Date().toISOString();
const version = {
  version: `${commit}-${Date.now()}`,
  commit,
  builtAt,
};

await writeFile("version.json", `${JSON.stringify(version, null, 2)}\n`);
