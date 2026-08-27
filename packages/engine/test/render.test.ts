import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getRenderer, renderStamp, runCommand } from "../src/render";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "filmwright-render-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const ESC = String.fromCharCode(27);

describe("runCommand", () => {
  const run = async (script: string) => {
    const lines: string[] = [];
    const result = await runCommand(
      process.execPath,
      ["-e", script],
      tmp,
      (line) => lines.push(line),
      new AbortController().signal,
    );
    return { lines, ...result };
  };

  it("streams stdout and stderr line by line", async () => {
    const { lines, code } = await run(
      'process.stdout.write("one\\ntwo\\n"); process.stderr.write("err\\n");',
    );
    expect(code).toBe(0);
    expect(lines).toContain("one");
    expect(lines).toContain("two");
    expect(lines).toContain("err");
  });

  it("strips ANSI colour and flushes a trailing partial line", async () => {
    const { lines } = await run(
      'process.stdout.write("\\u001b[32mgreen\\u001b[0m\\nno newline at end");',
    );
    expect(lines).toContain("green");
    expect(lines).toContain("no newline at end");
    expect(lines.join("\n")).not.toContain(ESC);
  });

  it("drops blank lines and reports a non-zero exit code", async () => {
    const { lines, code } = await run('console.log(""); process.exit(3);');
    expect(lines).toEqual([]);
    expect(code).toBe(3);
  });
});

describe("renderStamp", () => {
  it("is null for no file or a missing file", () => {
    expect(renderStamp(null)).toBeNull();
    expect(renderStamp(path.join(tmp, "nope.mp4"))).toBeNull();
  });

  it("identifies a file by path and mtime, changing when it is rewritten", () => {
    const file = path.join(tmp, "out.mp4");
    fs.writeFileSync(file, "a");
    const before = renderStamp(file);
    expect(before).toContain(file);
    const past = new Date(Date.now() - 5_000);
    fs.utimesSync(file, past, past);
    expect(renderStamp(file)).not.toBe(before);
  });
});

describe("getRenderer", () => {
  it("returns the local renderer under the default configuration", () => {
    expect(getRenderer().name).toBe("local");
  });
});
