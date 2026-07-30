import { readFile, writeFile } from "node:fs/promises";
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

async function versionScript(file, script) {
  const source = await readFile(file, "utf8");
  const escapedScript = script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(${escapedScript})(?:\\?v=[^"']+)?`,
    "g",
  );
  await writeFile(
    file,
    source.replace(pattern, `$1?v=${version.version}`),
  );
}

await Promise.all([
  versionScript("index.html", "./version.js"),
  versionScript("index.html", "./app.js"),
  versionScript("about/index.html", "../version.js"),
  versionScript("about/index.html", "../about-settings.js"),
]);
