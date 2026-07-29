#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const MIN_MAJOR = 21;

function majorVersionOf(javaBin) {
  const result = spawnSync(javaBin, ["-version"], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const match = output.match(/version "(\d+)(?:\.\d+)*"/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function javaBinFor(home) {
  if (!home) return null;
  const bin = path.join(home, "bin", "java");
  return existsSync(bin) ? bin : null;
}

function candidateHomes() {
  const homes = [];
  if (process.env.JAVA_HOME) homes.push(process.env.JAVA_HOME);

  const macJavaHome = spawnSync("/usr/libexec/java_home", ["-v", `${MIN_MAJOR}+`], {
    encoding: "utf8"
  });
  if (macJavaHome.status === 0) {
    const resolved = macJavaHome.stdout.trim();
    if (resolved) homes.push(resolved);
  }

  homes.push(
    "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
    "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
    "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
    "/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
    "/usr/lib/jvm/java-21-openjdk-amd64",
    "/usr/lib/jvm/java-21-openjdk"
  );

  return homes;
}

function resolveJavaHome() {
  for (const home of candidateHomes()) {
    const bin = javaBinFor(home);
    if (!bin) continue;
    const major = majorVersionOf(bin);
    if (major !== null && major >= MIN_MAJOR) return home;
  }
  return null;
}

const javaHome = resolveJavaHome();
if (!javaHome) {
  process.stderr.write(
    `The Firebase emulator requires JDK ${MIN_MAJOR} or newer, but no compatible Java runtime was found.\n` +
      "Install one (e.g. `brew install openjdk@21`) or set JAVA_HOME to a JDK 21+ home, then retry.\n"
  );
  process.exit(1);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const firebaseBin = path.resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "firebase.cmd" : "firebase"
);

const result = spawnSync(
  firebaseBin,
  [
    "emulators:exec",
    "--only",
    "firestore",
    "--project",
    "demo-lab-workflow-backend-test",
    `${npmCommand} --prefix backend run test:emulator`
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      JAVA_HOME: javaHome,
      PATH: `${path.join(javaHome, "bin")}${path.delimiter}${process.env.PATH ?? ""}`
    }
  }
);

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
