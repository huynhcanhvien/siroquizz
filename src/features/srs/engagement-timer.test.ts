import { describe, expect, it } from "vitest";
import { createEngagementTimer } from "./engagement-timer";

const s = (seconds: number) => seconds * 1000;

describe("createEngagementTimer", () => {
  it("adds the time between interactions", () => {
    const timer = createEngagementTimer(0);
    timer.touch(s(10));
    timer.touch(s(25));
    expect(timer.seconds(s(25))).toBe(25);
  });
  it("caps an idle gap so a tab left open does not count as study time", () => {
    const timer = createEngagementTimer(0);
    timer.touch(s(10));
    timer.touch(s(3600));
    expect(timer.seconds(s(3600))).toBe(70);
  });
  it("stops counting while hidden and resumes on the next interaction", () => {
    const timer = createEngagementTimer(0);
    timer.touch(s(20));
    timer.pause(s(30));
    expect(timer.seconds(s(900))).toBe(30);
    timer.touch(s(900));
    timer.touch(s(940));
    expect(timer.seconds(s(940))).toBe(70);
  });
  it("includes the trailing stretch since the last interaction, capped", () => {
    const timer = createEngagementTimer(0);
    timer.touch(s(5));
    expect(timer.seconds(s(35))).toBe(35);
    expect(timer.seconds(s(500))).toBe(65);
  });
});
