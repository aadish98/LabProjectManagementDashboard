import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ??
  process.env.GCLOUD_PROJECT ??
  "demo-lab-workflow-backend-test";

if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(emulatorHost)) {
  console.error(
    "Firestore emulator tests require FIRESTORE_EMULATOR_HOST on localhost; refusing to skip or contact a remote host."
  );
  process.exit(1);
}

if (!projectId.startsWith("demo-")) {
  console.error(
    "Firestore emulator tests require a demo-* project ID; refusing to run cleanup against any deployable project."
  );
  process.exit(1);
}

const vitest = fileURLToPath(
  new URL("../node_modules/vitest/vitest.mjs", import.meta.url)
);
const result = spawnSync(
  process.execPath,
  [vitest, "run", "test/repository.emulator.test.ts"],
  {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      GOOGLE_CLOUD_PROJECT: projectId,
      REQUIRE_FIRESTORE_EMULATOR: "1"
    },
    stdio: "inherit"
  }
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
