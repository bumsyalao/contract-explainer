import { describe, expect, it } from "vitest";
import { isLiveEnabled } from "./live";

describe("isLiveEnabled", () => {
  it("is on when unset or anything but off", () => {
    expect(isLiveEnabled({})).toBe(true);
    expect(isLiveEnabled({ LIVE_ANALYSIS: "on" })).toBe(true);
    expect(isLiveEnabled({ LIVE_ANALYSIS: "" })).toBe(true);
    expect(isLiveEnabled({ LIVE_ANALYSIS: "false" })).toBe(true); // only the word "off" turns it off
  });
  it("is off for off, in any case and with spaces", () => {
    for (const v of ["off", "OFF", " Off "]) expect(isLiveEnabled({ LIVE_ANALYSIS: v })).toBe(false);
  });
});
