import { cp, mkdir, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(root, "dist");
// Only replace this repository's generated dist directory, regardless of cwd.
if (dirname(output) !== resolve(root) || basename(output) !== "dist") {
  throw new Error("Build output must be the repository's dist directory");
}
await rm(output, { recursive: true, force: true });
await mkdir(output);
for (const path of [
  "index.html",
  "style.css",
  "app.js",
  "src",
  "assets",
  "examples",
]) {
  await cp(resolve(root, path), resolve(output, path), { recursive: true });
}
console.log("Static site built in dist/");
