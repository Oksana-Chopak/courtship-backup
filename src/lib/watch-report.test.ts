// scripts/watch-report.mjs turns a Playwright JSON report into Oksana's Telegram
// message — tested here with a synthetic report (one failure with a screenshot,
// one flaky, one skipped, the rest green).
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain ESM script, no types
import { compose, flatten } from "../../scripts/watch-report.mjs";

const report = {
  suites: [{
    title: "smoke.spec.ts",
    suites: [{
      title: "guest screens",
      specs: [
        { title: "landing", tests: [{ status: "expected", results: [{ status: "passed" }] }] },
        { title: "board", tests: [{ status: "unexpected", results: [
          { status: "failed", errors: [{ message: "\u001b[31mError: expect(received).not.toContain(expected)\u001b[39m\n/board: a player would see an error — “Something went wrong”\nmore" }], attachments: [{ name: "screenshot", path: "/tmp/shot.png" }] },
          { status: "failed", errors: [{ message: "Error: still broken" }], attachments: [{ name: "screenshot", path: "/tmp/shot2.png" }] },
        ] }] },
        { title: "players", tests: [{ status: "flaky", results: [{ status: "failed" }, { status: "passed" }] }] },
      ],
    }, {
      title: "member screens (monitor account)",
      specs: [{ title: "every member screen", tests: [{ status: "skipped", results: [] }] }],
    }],
  }],
};

describe("watch-report", () => {
  it("flattens suites into titled tests with the last result's first error and screenshot", () => {
    const tests = flatten(report);
    expect(tests.map((t: any) => `${t.title}:${t.status}`)).toEqual([
      "smoke.spec.ts › guest screens › landing:expected",
      "smoke.spec.ts › guest screens › board:unexpected",
      "smoke.spec.ts › guest screens › players:flaky",
      "smoke.spec.ts › member screens (monitor account) › every member screen:skipped",
    ]);
    const board = tests[1];
    expect(board.error).toBe("Error: still broken");
    expect(board.screenshot).toBe("/tmp/shot2.png");
  });
  it("writes one red message with the failing screens, what to do, and notes flaky/skipped", () => {
    const text = compose(flatten(report), { now: new Date("2026-10-24T06:05:00Z") });
    expect(text).toContain("🔴 Courtship — 1 screen broken in a real browser · lör 24 okt 08:05");
    expect(text).toContain("❌ smoke.spec.ts › guest screens › board");
    expect(text).toContain("   Error: still broken");
    expect(text).toContain("Do: open https://court-ship.com on your phone");
    expect(text).toContain("⚠️ passed on retry (slow?): smoke.spec.ts › guest screens › players");
    expect(text).toContain("(1 skipped");
  });
  it("stays silent when everything is green — unless the morning run asks for the line", () => {
    const green = flatten({ suites: [{ title: "s", specs: [{ title: "a", tests: [{ status: "expected", results: [{ status: "passed" }] }] }] }] });
    expect(compose(green)).toBeNull();
    expect(compose(green, { always: true, now: new Date("2026-10-24T06:05:00Z") })).toBe("✅ Courtship — all 1 browser screens open · lör 24 okt 08:05");
  });
  it("strips ANSI colours and keeps the first error line short", () => {
    const tests = flatten({ suites: [{ title: "s", specs: [{ title: "x", tests: [{ status: "unexpected", results: [{ status: "failed", errors: [{ message: "\u001b[2mError: boom\u001b[22m\n" + "y".repeat(2000) }] }] }] }] }] });
    expect(tests[0].error.startsWith("Error: boom")).toBe(true);
    expect(tests[0].error).not.toContain("\u001b");
    expect(tests[0].error.length).toBeLessThanOrEqual(600);
  });
});
