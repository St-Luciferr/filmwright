import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { childEnv, localPython } from "../src/env";

const SET = [
  "FW_TEST_PLAIN",
  "FW_TEST_API_KEY",
  "FW_TEST_TOKEN",
  "FW_TEST_SECRET",
  "FW_TEST_PASSWORD",
  "SSH_AUTH_SOCK",
  "npm_config_//registry.npmjs.org/:_authToken",
  "MYSQL_PWD",
  "FW_TEST_DSN",
  "FW_TEST_WEBHOOK_URL",
  "FW_TEST_PAT",
  "FW_TEST_PATTERN",
  "FW_TEST_URL_CREDS",
  "FW_TEST_URL_PLAIN",
  "HYPERFRAMES_PYTHON",
  "FILMWRIGHT_MUSICGEN_PYTHON",
];

let saved: Record<string, string | undefined>;
beforeEach(() => {
  saved = Object.fromEntries(SET.map((k) => [k, process.env[k]]));
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("childEnv", () => {
  it("strips names that read as credentials", () => {
    process.env.FW_TEST_API_KEY = "k";
    process.env.FW_TEST_TOKEN = "t";
    process.env.FW_TEST_SECRET = "s";
    process.env.FW_TEST_PASSWORD = "p";
    process.env.FW_TEST_PLAIN = "keep";
    const env = childEnv();
    expect(env.FW_TEST_API_KEY).toBeUndefined();
    expect(env.FW_TEST_TOKEN).toBeUndefined();
    expect(env.FW_TEST_SECRET).toBeUndefined();
    expect(env.FW_TEST_PASSWORD).toBeUndefined();
    expect(env.FW_TEST_PLAIN).toBe("keep");
  });

  it("strips the agent socket and npm's registry token", () => {
    process.env.SSH_AUTH_SOCK = "/run/ssh.sock";
    process.env["npm_config_//registry.npmjs.org/:_authToken"] = "npm_abc";
    const env = childEnv();
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
    expect(env["npm_config_//registry.npmjs.org/:_authToken"]).toBeUndefined();
  });

  it("strips secret-adjacent names but not their lookalikes", () => {
    process.env.MYSQL_PWD = "x";
    process.env.FW_TEST_DSN = "x";
    process.env.FW_TEST_WEBHOOK_URL = "x";
    process.env.FW_TEST_PAT = "x";
    process.env.FW_TEST_PATTERN = "harmless";
    const env = childEnv();
    expect(env.MYSQL_PWD).toBeUndefined();
    expect(env.FW_TEST_DSN).toBeUndefined();
    expect(env.FW_TEST_WEBHOOK_URL).toBeUndefined();
    expect(env.FW_TEST_PAT).toBeUndefined();
    // PAT is anchored: PATH and PATTERN survive.
    expect(env.PATH).toBeDefined();
    expect(env.FW_TEST_PATTERN).toBe("harmless");
  });

  it("strips values that are URLs with embedded credentials", () => {
    process.env.FW_TEST_URL_CREDS = "postgres://user:hunter2@db.example.com/app";
    process.env.FW_TEST_URL_PLAIN = "https://example.com/path";
    const env = childEnv();
    expect(env.FW_TEST_URL_CREDS).toBeUndefined();
    expect(env.FW_TEST_URL_PLAIN).toBe("https://example.com/path");
  });

  it("applies extras last, even over a filtered name", () => {
    const env = childEnv({ FW_TEST_TOKEN: "explicit", FW_TEST_PLAIN: "override" });
    expect(env.FW_TEST_TOKEN).toBe("explicit");
    expect(env.FW_TEST_PLAIN).toBe("override");
  });
});

describe("localPython", () => {
  it("reports the interpreter variables as they stand", () => {
    process.env.HYPERFRAMES_PYTHON = "/opt/venv/bin/python";
    delete process.env.FILMWRIGHT_MUSICGEN_PYTHON;
    expect(localPython()).toEqual({
      HYPERFRAMES_PYTHON: "/opt/venv/bin/python",
      FILMWRIGHT_MUSICGEN_PYTHON: undefined,
    });
  });
});
