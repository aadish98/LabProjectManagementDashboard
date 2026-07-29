import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const scanDirs = ["src", "docs", "scripts"];
const scanFiles = ["index.html", "package.json"];
const allowedFamily = `"Avenir Next"`;
const portableFamilyStack =
  `"Avenir Next", Avenir, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
const allowedVarNames = new Set([
  "--font-primary",
  "--font-secondary",
  "--gantt-display-font",
  "--gantt-body-font",
  "--gantt-mono-font"
]);
const ignoredDirs = new Set(["node_modules", "dist", "target", "release", ".git"]);
const allowedExtensions = new Set([".css", ".html", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"]);

function extensionOf(path) {
  const match = path.match(/\.[^.]+$/);
  return match ? match[0] : "";
}

function walk(path, files = []) {
  const stat = statSync(path);
  if (stat.isDirectory()) {
    const name = path.split(/[\\/]/).pop();
    if (ignoredDirs.has(name)) return files;
    for (const entry of readdirSync(path)) {
      walk(join(path, entry), files);
    }
    return files;
  }

  if (allowedExtensions.has(extensionOf(path))) files.push(path);
  return files;
}

const files = [
  ...scanDirs.flatMap((dir) => {
    try {
      return walk(join(root, dir));
    } catch {
      return [];
    }
  }),
  ...scanFiles.map((file) => join(root, file))
];

const failures = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const rel = relative(root, file);

  if (/fonts\.(googleapis|gstatic)\.com/i.test(source)) {
    failures.push(`${rel}: external font provider found`);
  }

  for (const match of source.matchAll(/(--[\w-]*font[\w-]*|font-family)\s*:\s*([^;\n}]+)/gi)) {
    const property = match[1];
    const value = match[2].trim().replace(/\s*!important$/i, "");

    if (property.startsWith("--")) {
      if (
        allowedVarNames.has(property) &&
        value !== allowedFamily &&
        value !== portableFamilyStack
      ) {
        failures.push(
          `${rel}: ${property} must use Avenir Next with the approved system fallback stack`
        );
      }
      continue;
    }

    const varMatch = value.match(/^var\((--[\w-]+)\)$/);
    if (value === allowedFamily) continue;
    if (varMatch && allowedVarNames.has(varMatch[1])) continue;

    failures.push(`${rel}: font-family must be ${allowedFamily}, found ${value}`);
  }
}

if (failures.length > 0) {
  console.error("GUI fonts must use Avenir Next with approved system fallbacks.\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Font policy passed: Avenir Next with portable system fallbacks.");
