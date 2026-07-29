import { describe, expect, it } from "vitest";
import {
  isDeletedManagedKey,
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
  "tb_live_AAECAwQF_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const INTERNAL_PREFIX_MISMATCH =
  "tb_live_CCCCCCCC_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const VIEW_PREFIX_MISMATCH =
  "tb_live_BAECAwQF_BAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const CANONICAL_LAST_CHARACTERS = "AEIMQUYcgkosw048";

describe("Admin key response DTO validators", () => {
  it("accepts only the exact deleted-key id response", () => {
    expect(isDeletedManagedKey({ id: VIEW.id })).toBe(true);
    for (const value of [
      null,
      {},
      { id: "not-a-uuid" },
      { id: VIEW.id, key_digest: "digest-leak-marker" },
      { id: VIEW.id, secret: SECRET },
    ]) {
      expect(isDeletedManagedKey(value)).toBe(false);
    }
  });

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
    expect(isManagedKeyWithSecret({
      ...VIEW,
      secret: INTERNAL_PREFIX_MISMATCH,
    })).toBe(false);
    expect(isManagedKeyWithSecret({
      ...VIEW,
      secret: VIEW_PREFIX_MISMATCH,
    })).toBe(false);
    expect(isManagedKeyWithSecret(VIEW)).toBe(false);
    expect(isManagedKeyWithSecret({ ...VIEW, secret: "tb_live_bad" }))
      .toBe(false);
    expect(isManagedKeyWithSecret({
      ...VIEW,
      secret: SECRET,
      key_digest: "digest-leak-marker",
    })).toBe(false);
  });

  it("accepts only canonical base64url encodings of 32-byte secrets", () => {
    for (const [value, expectedLast] of [
      ...CANONICAL_LAST_CHARACTERS,
    ].entries()) {
      const bytes = new Uint8Array(32);
      bytes[31] = value;
      const suffix = btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
      expect(suffix).toBe(`${"A".repeat(42)}${expectedLast}`);
      expect(isManagedKeyWithSecret({
        ...VIEW,
        key_prefix: "tb_live_AAAAAAAA",
        secret: `tb_live_AAAAAAAA_${suffix}`,
      })).toBe(true);
    }

    for (const invalidLast of ["9", "B", "-", "_"]) {
      expect(isManagedKeyWithSecret({
        ...VIEW,
        key_prefix: "tb_live_AAAAAAAA",
        secret: `tb_live_AAAAAAAA_${"A".repeat(42)}${invalidLast}`,
      })).toBe(false);
    }
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
