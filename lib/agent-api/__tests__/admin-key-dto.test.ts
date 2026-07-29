import { describe, expect, it } from "vitest";
import {
  isManagedKeyView,
  isManagedKeyViewArray,
  isManagedKeyWithSecret,
} from "@/lib/agent-api/admin-key-dto";

const VIEW = {
  id: "40000000-0000-4000-8000-000000000001",
  name: "Bruce experiments",
  key_prefix: "tb_live_AAECAwQF",
  member: {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Bruce",
  },
  scopes: ["board:read", "experiments:write"],
  expires_at: "2026-08-01T12:00:00.000Z",
  revoked_at: null,
  last_used_at: null,
  created_at: "2026-07-29T12:00:00.000Z",
};

const SECRET =
  "tb_live_CCCCCCCC_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

describe("Admin key response DTO validators", () => {
  it("accepts only the exact ManagedKeyView response shape", () => {
    expect(isManagedKeyView(VIEW)).toBe(true);
    expect(isManagedKeyView({ ...VIEW, member: null })).toBe(true);

    const invalid = [
      null,
      "not-a-key",
      [],
      { ...VIEW, id: "not-a-uuid" },
      { ...VIEW, name: "" },
      { ...VIEW, key_prefix: "tb_live_too-long-prefix" },
      { ...VIEW, member: { id: VIEW.member.id } },
      { ...VIEW, scopes: ["board:read", "board:read"] },
      { ...VIEW, scopes: ["unknown:scope"] },
      { ...VIEW, expires_at: "not-a-date" },
      { ...VIEW, created_at: null },
      { ...VIEW, key_digest: "digest-leak-marker" },
      { ...VIEW, secret: SECRET },
    ];
    for (const value of invalid) {
      expect(isManagedKeyView(value)).toBe(false);
    }
    const { created_at: _missing, ...missingCreatedAt } = VIEW;
    expect(isManagedKeyView(missingCreatedAt)).toBe(false);
  });

  it("requires a strict generated secret and no extra fields", () => {
    expect(isManagedKeyWithSecret({ ...VIEW, secret: SECRET })).toBe(true);
    expect(isManagedKeyWithSecret(VIEW)).toBe(false);
    expect(isManagedKeyWithSecret({ ...VIEW, secret: "tb_live_bad" }))
      .toBe(false);
    expect(isManagedKeyWithSecret({
      ...VIEW,
      secret: SECRET,
      key_digest: "digest-leak-marker",
    })).toBe(false);
  });

  it("validates every item in a ManagedKeyView array", () => {
    expect(isManagedKeyViewArray([])).toBe(true);
    expect(isManagedKeyViewArray([VIEW, { ...VIEW, member: null }])).toBe(true);
    expect(isManagedKeyViewArray(VIEW)).toBe(false);
    expect(isManagedKeyViewArray([VIEW, null])).toBe(false);
    expect(isManagedKeyViewArray([
      VIEW,
      { ...VIEW, key_digest: "digest-leak-marker" },
    ])).toBe(false);
  });
});
