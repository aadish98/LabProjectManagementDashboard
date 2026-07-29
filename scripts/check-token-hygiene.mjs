#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "target",
  "release",
  "coverage",
  "__pycache__"
]);
const textExtensions = new Set([
  "",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".rs",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);
const hardcodedGoogleClientSecret = /GOCSPX-[A-Za-z0-9_-]+/;
const tokenLogPattern =
  /\b(console\.(?:debug|error|info|log|trace|warn)|eprintln!|println!)\b.*\b(access.?token|refresh.?token|id.?token|authorization|bearer|client.?secret)\b/i;
const directTokenStoragePattern =
  /\blocalStorage\.setItem\b.*\b(access.?token|refresh.?token|id.?token|authorization|bearer|client.?secret)\b/i;

async function collectFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    if (entry.isFile() && entry.name.startsWith(".env") && entry.name !== ".env.example") {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
    } else if (textExtensions.has(path.extname(entry.name)) || entry.name === ".env.example") {
      files.push(fullPath);
    }
  }
  return files;
}

const failures = [];
for (const file of await collectFiles(root)) {
  const relative = path.relative(root, file);
  const contents = await readFile(file, "utf8").catch(() => "");
  const isGeneratedBuild =
    relative.startsWith(`dist${path.sep}`) ||
    relative.startsWith(`backend${path.sep}dist${path.sep}`);
  // Vite inlines VITE_* values into dist/; Google Desktop OAuth still needs
  // the client secret at runtime. Only flag secrets committed in source.
  if (isGeneratedBuild) continue;
  if (hardcodedGoogleClientSecret.test(contents)) {
    failures.push(`${relative}: contains a hardcoded Google OAuth client secret value`);
  }
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (tokenLogPattern.test(line)) {
      failures.push(`${relative}:${index + 1}: may log an OAuth bearer credential`);
    }
    if (directTokenStoragePattern.test(line)) {
      failures.push(`${relative}:${index + 1}: writes an OAuth bearer credential to localStorage`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    "Token hygiene passed: source contains no hardcoded Google client secret values, no likely token logging, and no direct token localStorage writes.\n"
  );
}
