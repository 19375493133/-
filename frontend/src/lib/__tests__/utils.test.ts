import { describe, expect, it } from "vitest";

import { formatDuration, highlightLabel } from "@/lib/utils";

describe("formatDuration", () => {
  it("formats seconds as mm:ss", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("includes hours when needed", () => {
    expect(formatDuration(3600)).toBe("01:00:00");
  });
});

describe("highlightLabel", () => {
  it("maps supported types to Chinese labels", () => {
    expect(highlightLabel("important")).toBe("重点");
    expect(highlightLabel("note")).toBe("笔记");
  });

  it("returns the raw value for unknown types", () => {
    expect(highlightLabel("unknown")).toBe("unknown");
  });
});

