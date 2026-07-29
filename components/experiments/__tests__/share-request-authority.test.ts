import { describe, expect, it } from "vitest";
import { ShareRequestAuthority } from "@/components/experiments/share-request-authority";

describe("ShareRequestAuthority", () => {
  it("invalidates a pending request when disposed", () => {
    const authority = new ShareRequestAuthority();
    const pending = authority.issue();

    expect(authority.isCurrent(pending)).toBe(true);

    authority.dispose();

    expect(authority.isCurrent(pending)).toBe(false);
  });

  it("lets a new issue become current after invalidation without reviving the old request", () => {
    const authority = new ShareRequestAuthority();
    const oldRequest = authority.issue();

    authority.invalidate();
    const newRequest = authority.issue();

    expect(authority.isCurrent(oldRequest)).toBe(false);
    expect(authority.isCurrent(newRequest)).toBe(true);
  });
});
