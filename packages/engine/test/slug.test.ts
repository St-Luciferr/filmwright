import fs from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/config", () => import("./helpers/tmp-config"));

import { PROJECTS_DIR, ROOT } from "../src/config";
import { freeSlug, projectSlug } from "../src/slug";

afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

describe("projectSlug", () => {
  it("keeps the meaningful words and drops the filler", () => {
    expect(projectSlug("Make a video about the Acme launch")).toBe("acme-launch");
  });

  it("strips URLs and punctuation", () => {
    expect(projectSlug("Promo for https://acme.dev — the CI/CD platform!")).toBe(
      "promo-ci-cd-platform",
    );
  });

  it("takes at most four words and caps the length", () => {
    const slug = projectSlug(
      "supercalifragilisticexpialidocious extraordinarily comprehensive demonstration reel today",
    );
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.split("-").length).toBeLessThanOrEqual(4 + 3); // hyphens within words aside
  });

  it("falls back to 'video' when nothing survives", () => {
    expect(projectSlug("a the of to")).toBe("video");
  });

  it("suffixes past existing project directories", () => {
    fs.mkdirSync(path.join(PROJECTS_DIR, "acme-launch"), { recursive: true });
    fs.mkdirSync(path.join(PROJECTS_DIR, "acme-launch-2"), { recursive: true });
    expect(projectSlug("make a video about the acme launch")).toBe("acme-launch-3");
  });
});

describe("freeSlug", () => {
  const claim = (name: string) => {
    const dir = path.join(PROJECTS_DIR, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "hyperframes.json"), "{}");
  };

  it("returns the slug itself when nothing holds it", async () => {
    expect(await freeSlug("untaken")).toBe("untaken");
  });

  it("treats an empty directory as free", async () => {
    fs.mkdirSync(path.join(PROJECTS_DIR, "empty-dir"), { recursive: true });
    expect(await freeSlug("empty-dir")).toBe("empty-dir");
  });

  it("walks to the next free suffix", async () => {
    claim("promo");
    claim("promo-2");
    expect(await freeSlug("promo")).toBe("promo-3");
  });

  it("gives up after 99 collisions", async () => {
    claim("crowded");
    for (let n = 2; n < 100; n++) claim(`crowded-${n}`);
    await expect(freeSlug("crowded")).rejects.toThrow(/free project name/);
  });
});
