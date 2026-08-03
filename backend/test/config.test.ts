import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const CLIENT_A = "1-a.apps.googleusercontent.com";
const CLIENT_B = "2-b.apps.googleusercontent.com";

function environment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GOOGLE_OAUTH_CLIENT_IDS: CLIENT_A,
    GOOGLE_OAUTH_CLIENT_SECRET: "test-client-secret-value",
    ...overrides
  };
}

describe("loadConfig", () => {
  it("requires the brokered client secret", () => {
    const missing = environment();
    delete missing.GOOGLE_OAUTH_CLIENT_SECRET;
    expect(() => loadConfig(missing)).toThrow();
  });

  it("defaults the brokered client to the sole configured audience", () => {
    expect(loadConfig(environment()).brokeredClientId).toBe(CLIENT_A);
  });

  it("requires an explicit brokered client when several audiences are configured", () => {
    expect(() =>
      loadConfig(environment({ GOOGLE_OAUTH_CLIENT_IDS: `${CLIENT_A},${CLIENT_B}` }))
    ).toThrow(/GOOGLE_OAUTH_TOKEN_CLIENT_ID is required/);

    expect(
      loadConfig(
        environment({
          GOOGLE_OAUTH_CLIENT_IDS: `${CLIENT_A},${CLIENT_B}`,
          GOOGLE_OAUTH_TOKEN_CLIENT_ID: CLIENT_B
        })
      ).brokeredClientId
    ).toBe(CLIENT_B);
  });

  it("rejects a brokered client that is not an accepted audience", () => {
    expect(() =>
      loadConfig(
        environment({ GOOGLE_OAUTH_TOKEN_CLIENT_ID: "3-c.apps.googleusercontent.com" })
      )
    ).toThrow(/must be one of the client IDs/);
  });
});
