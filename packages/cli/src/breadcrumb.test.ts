import type { CrimesConfig } from "@crimes/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  emitDetectorsDisabledBreadcrumb,
  resolveNoColor,
} from "./breadcrumb.js";

function makeConfig(disabled: string[]): CrimesConfig {
  return {
    include: ["**/*.ts"],
    exclude: [],
    thresholds: {
      largeFileLines: 300,
      largeFunctionLines: 60,
      todoDensityPerKLoc: 10,
    },
    detectors: { disable: disabled },
  };
}

class FakeStderr {
  chunks: string[] = [];
  write(s: string): boolean {
    this.chunks.push(s);
    return true;
  }
}

describe("emitDetectorsDisabledBreadcrumb", () => {
  it("stays silent when fewer than 3 detectors are disabled", () => {
    const stderr = new FakeStderr();
    emitDetectorsDisabledBreadcrumb(makeConfig(["a", "b"]), { stderr });
    expect(stderr.chunks).toEqual([]);
  });

  it("stays silent when detectors.disable is missing entirely", () => {
    const stderr = new FakeStderr();
    emitDetectorsDisabledBreadcrumb(
      {
        include: [],
        exclude: [],
        thresholds: {
          largeFileLines: 300,
          largeFunctionLines: 60,
          todoDensityPerKLoc: 10,
        },
      },
      { stderr },
    );
    expect(stderr.chunks).toEqual([]);
  });

  it("emits a one-line breadcrumb when 3 detectors are disabled", () => {
    const stderr = new FakeStderr();
    emitDetectorsDisabledBreadcrumb(
      makeConfig(["large_function", "todo_density", "direct_date"]),
      { stderr },
    );
    expect(stderr.chunks).toHaveLength(1);
    expect(stderr.chunks[0]!).toContain(
      "detectors.disable removed 3 detectors from this run",
    );
    expect(stderr.chunks[0]!).toMatch(/crimes ignore/);
  });

  it("includes the actual disabled count in the message (5 detectors)", () => {
    const stderr = new FakeStderr();
    emitDetectorsDisabledBreadcrumb(
      makeConfig(["a", "b", "c", "d", "e"]),
      { stderr },
    );
    expect(stderr.chunks[0]!).toContain(
      "detectors.disable removed 5 detectors from this run",
    );
  });

  it("stays silent when noColor is set, even with 5 disabled", () => {
    const stderr = new FakeStderr();
    emitDetectorsDisabledBreadcrumb(
      makeConfig(["a", "b", "c", "d", "e"]),
      { stderr, noColor: true },
    );
    expect(stderr.chunks).toEqual([]);
  });
});

describe("resolveNoColor", () => {
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: originalIsTTY,
      configurable: true,
    });
  });

  function setIsTTY(value: boolean): void {
    Object.defineProperty(process.stdout, "isTTY", {
      value,
      configurable: true,
    });
  }

  it("returns true when Commander parses --no-color (color: false)", () => {
    setIsTTY(true);
    expect(resolveNoColor({ color: false })).toBe(true);
  });

  it("returns false in an interactive TTY with no flag", () => {
    setIsTTY(true);
    expect(resolveNoColor({})).toBe(false);
  });

  it("returns true when stdout is piped, regardless of flag absence", () => {
    setIsTTY(false);
    expect(resolveNoColor({})).toBe(true);
  });

  it("returns true when the legacy noColor: true is passed", () => {
    setIsTTY(true);
    expect(resolveNoColor({ noColor: true })).toBe(true);
  });
});
