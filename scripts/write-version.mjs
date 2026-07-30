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

async function versionScripts(file, scripts) {
  let source = await readFile(file, "utf8");
  for (const script of scripts) {
    const escapedScript = script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(${escapedScript})(?:\\?v=[^"']+)?`,
      "g",
    );
    source = source.replace(pattern, `$1?v=${version.version}`);
  }
  await writeFile(file, source);
}

await Promise.all([
  versionScripts("index.html", ["./version.js", "./app.js"]),
  versionScripts("about/index.html", [
    "../version.js",
    "../about-settings.js",
  ]),
  versionScripts("compare/index.html", [
    "../version.js",
    "../compare.js",
    "../about-settings.js",
  ]),
]);
