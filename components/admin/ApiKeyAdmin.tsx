"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  API_SCOPES,
  type ApiScope,
} from "@/lib/agent-api/types";
import {
  isManagedKeyView,
  isManagedKeyViewArray,
  isManagedKeyWithSecret,
} from "@/lib/agent-api/admin-key-dto";
import type {
  ManagedKeyInput,
  ManagedKeyView,
  ManagedKeyWithSecret,
} from "@/lib/agent-api/admin-keys";

interface MemberOption {
  id: string;
  name: string;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

interface KeyDraft {
  name: string;
  member_id: string;
  scopes: ApiScope[];
  expires_at: string;
}

export type ManagedKeyStatus = "active" | "expired" | "revoked";

const EMPTY_DRAFT: KeyDraft = {
  name: "",
  member_id: "",
  scopes: [],
  expires_at: "",
};

const ROTATION_UNCERTAIN_MESSAGE =
  "Rotation may have reached the server: the old credential may already be "
  + "invalid, and the new secret cannot be recovered. Refresh the list, then "
  + "rotate again if needed.";

const SESSION_VERIFICATION_ERROR =
  "Could not verify your session. Try again.";

const MAX_TIMER_DELAY_MS = 2_147_483_647;

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error && reason.message.trim()
    ? reason.message
    : fallback;
}

export class AdminApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly code: string,
    message: string,
    readonly requestDispatched = true,
  ) {
    super(message);
    this.name = "AdminApiClientError";
  }
}

export class AdminRequestError extends Error {
  constructor(
    readonly requestDispatched: boolean,
    message: string,
  ) {
    super(message);
    this.name = "AdminRequestError";
  }
}

async function readEnvelope<T>(
  response: Response,
  fallback: string,
  validator: (value: unknown) => value is T,
): Promise<T> {
  const { ok, status, statusText } = response;
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    if (!ok) {
      throw new AdminApiClientError(
        status,
        statusText,
        `HTTP_${status}`,
        fallback,
      );
    }
    throw new AdminRequestError(true, fallback);
  }
  const body: ApiEnvelope<T> = (
    parsed !== null && typeof parsed === "object"
  ) ? parsed as ApiEnvelope<T> : {};
  if (!ok) {
    throw new AdminApiClientError(
      status,
      statusText,
      typeof body.error?.code === "string"
        ? body.error.code
        : `HTTP_${status}`,
      typeof body.error?.message === "string" ? body.error.message : fallback,
    );
  }
  if (!validator(body.data)) throw new AdminRequestError(true, fallback);
  return body.data;
}

function expiryForApi(value: string): string | null {
  if (!value) return null;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.valueOf())) {
    throw new Error("Expiry must be a valid date and time.");
  }
  return timestamp.toISOString();
}

function expiryForInput(value: string | null): string {
  if (value === null) return "";
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.valueOf())) return "";
  const local = new Date(timestamp.valueOf() - timestamp.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function managedKeyStatus(
  key: Pick<ManagedKeyView, "expires_at" | "revoked_at">,
  now: number,
): ManagedKeyStatus {
  if (key.revoked_at !== null) return "revoked";
  if (key.expires_at === null) return "active";
  const expiresAt = Date.parse(key.expires_at);
  return !Number.isFinite(expiresAt) || expiresAt <= now
    ? "expired"
    : "active";
}

function withoutSecret(result: ManagedKeyWithSecret): ManagedKeyView {
  const { secret: _discardedSecret, ...view } = result;
  return view;
}

function isUncertainRotationFailure(reason: unknown): boolean {
  if (
    !(reason instanceof AdminApiClientError)
    && !(reason instanceof AdminRequestError)
  ) {
    return false;
  }
  if (!reason.requestDispatched) return false;
  return reason instanceof AdminApiClientError
    ? reason.status >= 500
    : true;
}

interface RequestOperation {
  finish: () => void;
  isCurrent: () => boolean;
  token?: string;
}

export default function ApiKeyAdmin() {
  const [keys, setKeys] = useState<ManagedKeyView[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [rotationUncertain, setRotationUncertain] = useState(false);
  const [createDraft, setCreateDraft] = useState<KeyDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<KeyDraft>(EMPTY_DRAFT);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [oneTimeSecret, setOneTimeSecret] = useState<{
    value: string;
    source: "created" | "rotated";
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const mounted = useRef(false);
  const loadGeneration = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);
  const loadInFlight = useRef(false);
  const mutationGeneration = useRef(0);
  const mutationInFlight = useRef(false);
  const sessionInvalid = useRef(false);

  const handleRequestFailure = useCallback(async (
    reason: unknown,
    fallback: string,
    operation: RequestOperation,
  ) => {
    if (reason instanceof AdminApiClientError && reason.status === 401) {
      if (!operation.token || !operation.isCurrent() || !supabase) return;
      let sessionResult;
      try {
        sessionResult = await supabase.auth.getSession();
      } catch {
        if (operation.isCurrent()) setError(SESSION_VERIFICATION_ERROR);
        return;
      }
      if (
        !operation.isCurrent()
        || sessionResult.error
        || sessionResult.data.session?.access_token !== operation.token
      ) {
        return;
      }
      if (!sessionInvalid.current) {
        sessionInvalid.current = true;
        try {
          await supabase?.auth.signOut({ scope: "local" });
        } catch {
          // AuthGate still needs the local session-expired state below.
        }
      }
      if (operation.isCurrent()) {
        setSessionExpired(true);
        setError("Your session has expired. Sign in again.");
      }
      return;
    }
    if (operation.isCurrent()) setError(errorMessage(reason, fallback));
  }, []);

  const load = useCallback(async () => {
    if (
      sessionInvalid.current
      || loadInFlight.current
      || mutationInFlight.current
    ) {
      return;
    }
    loadInFlight.current = true;
    const generation = ++loadGeneration.current;
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    const operation: RequestOperation = {
      finish: () => {
        if (generation === loadGeneration.current) {
          loadInFlight.current = false;
        }
      },
      isCurrent: () => (
        mounted.current && generation === loadGeneration.current
      ),
    };
    setLoading(true);
    setError(null);

    if (!isSupabaseConfigured || !supabase) {
      if (mounted.current && generation === loadGeneration.current) {
        setLoading(false);
        setError("Connect Supabase before managing API keys.");
      }
      operation.finish();
      return;
    }

    try {
      const client = supabase;
      let sessionPromise;
      try {
        sessionPromise = client.auth.getSession();
      } catch {
        throw new AdminRequestError(false, SESSION_VERIFICATION_ERROR);
      }
      const membersPromise = client
        .from("members")
        .select("id,name")
        .order("position");
      let sessionResult;
      try {
        sessionResult = await sessionPromise;
      } catch {
        throw new AdminRequestError(false, SESSION_VERIFICATION_ERROR);
      }
      const token = sessionResult.data.session?.access_token;
      if (sessionResult.error || !token) {
        throw new Error("Your session has expired. Sign in again.");
      }
      operation.token = token;
      const responsePromise = fetch("/api/admin/v1/api-keys", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: controller.signal,
      });
      const [membersOutcome, responseOutcome] = await Promise.allSettled([
        membersPromise,
        responsePromise,
      ]);
      if (responseOutcome.status === "rejected") {
        throw new AdminRequestError(true, "Could not load API keys.");
      }
      const loaded = await readEnvelope<ManagedKeyView[]>(
        responseOutcome.value,
        "Could not load API keys.",
        isManagedKeyViewArray,
      );
      if (
        membersOutcome.status === "rejected"
        || membersOutcome.value.error
      ) {
        throw new AdminRequestError(false, "Could not load Members.");
      }
      if (!mounted.current || generation !== loadGeneration.current) return;
      setMembers((membersOutcome.value.data ?? []) as MemberOption[]);
      setKeys(loaded);
      setRotationUncertain(false);
    } catch (reason) {
      if (
        !mounted.current
        || generation !== loadGeneration.current
        || (reason instanceof DOMException && reason.name === "AbortError")
      ) {
        return;
      }
      await handleRequestFailure(
        reason,
        "Could not load API keys.",
        operation,
      );
    } finally {
      operation.finish();
      if (mounted.current && generation === loadGeneration.current) {
        setLoading(false);
      }
    }
  }, [handleRequestFailure]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadGeneration.current += 1;
      mutationGeneration.current += 1;
      loadInFlight.current = false;
      mutationInFlight.current = false;
      loadAbort.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    let nextExpiry = Number.POSITIVE_INFINITY;
    for (const key of keys) {
      if (key.revoked_at !== null || key.expires_at === null) continue;
      const expiresAt = Date.parse(key.expires_at);
      if (
        Number.isFinite(expiresAt)
        && expiresAt > clockNow
        && expiresAt < nextExpiry
      ) {
        nextExpiry = expiresAt;
      }
    }
    if (!Number.isFinite(nextExpiry)) return;

    const actualNow = Date.now();
    if (nextExpiry <= actualNow) {
      setClockNow(actualNow);
      return;
    }
    const timer = window.setTimeout(() => {
      setClockNow(Date.now());
    }, Math.min(nextExpiry - actualNow, MAX_TIMER_DELAY_MS));
    return () => window.clearTimeout(timer);
  }, [clockNow, keys]);

  async function adminRequest<T>(
    path: string,
    init: RequestInit,
    fallback: string,
    operation: RequestOperation,
    validator: (value: unknown) => value is T,
  ): Promise<T> {
    if (!supabase) throw new Error("Connect Supabase first.");
    if (sessionInvalid.current) {
      throw new AdminApiClientError(
        401,
        "Unauthorized",
        "INVALID_ADMIN_SESSION",
        "Your session has expired. Sign in again.",
        false,
      );
    }
    let sessionResult;
    try {
      sessionResult = await supabase.auth.getSession();
    } catch {
      throw new AdminRequestError(
        false,
        "Your session has expired. Sign in again.",
      );
    }
    const { data, error: sessionError } = sessionResult;
    const token = data.session?.access_token;
    if (sessionError || !token) {
      throw new AdminRequestError(
        false,
        "Your session has expired. Sign in again.",
      );
    }
    operation.token = token;
    let headers: Headers;
    try {
      headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      if (init.body !== undefined) {
        headers.set("Content-Type", "application/json");
      }
    } catch {
      throw new AdminRequestError(false, fallback);
    }
    let response: Response;
    try {
      response = await fetch(path, {
        ...init,
        headers,
        cache: "no-store",
      });
    } catch {
      throw new AdminRequestError(true, fallback);
    }
    return readEnvelope<T>(response, fallback, validator);
  }

  function beginMutationOperation(): RequestOperation | null {
    if (loadInFlight.current || mutationInFlight.current) return null;
    mutationInFlight.current = true;
    const generation = ++mutationGeneration.current;
    return {
      finish: () => {
        if (generation === mutationGeneration.current) {
          mutationInFlight.current = false;
        }
      },
      isCurrent: () => (
        mounted.current && generation === mutationGeneration.current
      ),
    };
  }

  function toggleScope(
    draft: KeyDraft,
    setDraft: (next: KeyDraft) => void,
    scope: ApiScope,
  ) {
    const scopes = draft.scopes.includes(scope)
      ? draft.scopes.filter((value) => value !== scope)
      : API_SCOPES.filter(
        (value) => value === scope || draft.scopes.includes(value),
      );
    setDraft({ ...draft, scopes: [...scopes] });
  }

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    if (
      loading
      || sessionInvalid.current
      || rotationUncertain
      || creating
      || !createDraft.name.trim()
      || !createDraft.member_id
    ) {
      return;
    }
    const operation = beginMutationOperation();
    if (!operation) return;
    setCreating(true);
    setError(null);
    setOneTimeSecret(null);
    setCopied(false);
    try {
      const input: ManagedKeyInput = {
        name: createDraft.name.trim(),
        member_id: createDraft.member_id,
        scopes: [...createDraft.scopes],
        expires_at: expiryForApi(createDraft.expires_at),
      };
      const created = await adminRequest<ManagedKeyWithSecret>(
        "/api/admin/v1/api-keys",
        { method: "POST", body: JSON.stringify(input) },
        "Could not create the API key.",
        operation,
        isManagedKeyWithSecret,
      );
      if (!operation.isCurrent()) return;
      const view = withoutSecret(created);
      setKeys((current) => [
        view,
        ...current.filter((key) => key.id !== view.id),
      ]);
      setCreateDraft(EMPTY_DRAFT);
      setOneTimeSecret({ value: created.secret, source: "created" });
    } catch (reason) {
      await handleRequestFailure(
        reason,
        "Could not create the API key.",
        operation,
      );
    } finally {
      operation.finish();
      if (operation.isCurrent()) setCreating(false);
    }
  }

  function beginEdit(key: ManagedKeyView) {
    setEditingId(key.id);
    setEditDraft({
      name: key.name,
      member_id: key.member?.id ?? "",
      scopes: [...key.scopes],
      expires_at: expiryForInput(key.expires_at),
    });
  }

  async function saveEdit(event: React.FormEvent, key: ManagedKeyView) {
    event.preventDefault();
    if (
      creating
      || loading
      || sessionInvalid.current
      || rotationUncertain
      || pendingId !== null
      || !editDraft.name.trim()
      || !editDraft.member_id
    ) {
      return;
    }
    const operation = beginMutationOperation();
    if (!operation) return;
    setPendingId(key.id);
    setError(null);
    try {
      const changes: ManagedKeyInput = {
        name: editDraft.name.trim(),
        member_id: editDraft.member_id,
        scopes: [...editDraft.scopes],
        expires_at: expiryForApi(editDraft.expires_at),
      };
      const updated = await adminRequest<ManagedKeyView>(
        `/api/admin/v1/api-keys/${key.id}`,
        { method: "PATCH", body: JSON.stringify(changes) },
        "Could not update the API key.",
        operation,
        isManagedKeyView,
      );
      if (!operation.isCurrent()) return;
      setKeys((current) => current.map(
        (candidate) => candidate.id === updated.id ? updated : candidate,
      ));
      setEditingId(null);
    } catch (reason) {
      await handleRequestFailure(
        reason,
        "Could not update the API key.",
        operation,
      );
    } finally {
      operation.finish();
      if (operation.isCurrent()) setPendingId(null);
    }
  }

  async function rotateKey(key: ManagedKeyView) {
    if (
      creating
      || loading
      || sessionInvalid.current
      || rotationUncertain
      || pendingId !== null
      || managedKeyStatus(key, Date.now()) !== "active"
    ) {
      return;
    }
    const operation = beginMutationOperation();
    if (!operation) return;
    if (!window.confirm(
      "Rotate this API key? This will immediately invalidate the old "
      + "credential, and the new secret is shown only once.",
    )) {
      operation.finish();
      return;
    }
    setPendingId(key.id);
    setError(null);
    setOneTimeSecret(null);
    setCopied(false);
    try {
      const rotated = await adminRequest<ManagedKeyWithSecret>(
        `/api/admin/v1/api-keys/${key.id}/rotate`,
        { method: "POST" },
        "Could not rotate the API key.",
        operation,
        isManagedKeyWithSecret,
      );
      if (!operation.isCurrent()) return;
      const view = withoutSecret(rotated);
      setKeys((current) => current.map(
        (candidate) => candidate.id === view.id ? view : candidate,
      ));
      setOneTimeSecret({ value: rotated.secret, source: "rotated" });
    } catch (reason) {
      if (operation.isCurrent() && isUncertainRotationFailure(reason)) {
        setRotationUncertain(true);
        setError(ROTATION_UNCERTAIN_MESSAGE);
      } else {
        await handleRequestFailure(
          reason,
          "Could not rotate the API key.",
          operation,
        );
      }
    } finally {
      operation.finish();
      if (operation.isCurrent()) setPendingId(null);
    }
  }

  async function revokeKey(key: ManagedKeyView) {
    if (
      creating
      || loading
      || sessionInvalid.current
      || rotationUncertain
      || pendingId !== null
      || key.revoked_at !== null
    ) {
      return;
    }
    const operation = beginMutationOperation();
    if (!operation) return;
    if (!window.confirm(
      "Revoke this API key? Revocation is immediate and cannot be undone.",
    )) {
      operation.finish();
      return;
    }
    setPendingId(key.id);
    setError(null);
    try {
      const revoked = await adminRequest<ManagedKeyView>(
        `/api/admin/v1/api-keys/${key.id}/revoke`,
        { method: "POST" },
        "Could not revoke the API key.",
        operation,
        isManagedKeyView,
      );
      if (!operation.isCurrent()) return;
      setKeys((current) => current.map(
        (candidate) => candidate.id === revoked.id ? revoked : candidate,
      ));
    } catch (reason) {
      await handleRequestFailure(
        reason,
        "Could not revoke the API key.",
        operation,
      );
    } finally {
      operation.finish();
      if (operation.isCurrent()) setPendingId(null);
    }
  }

  async function copySecret() {
    if (!oneTimeSecret) return;
    try {
      await navigator.clipboard.writeText(oneTimeSecret.value);
      if (mounted.current) setCopied(true);
    } catch {
      if (mounted.current) setError("Could not copy the secret.");
    }
  }

  function renderScopeFields(
    draft: KeyDraft,
    setDraft: (next: KeyDraft) => void,
    labelPrefix = "",
  ) {
    return (
      <div className="api-key-scopes">
        {API_SCOPES.map((scope) => (
          <label key={scope}>
            <input
              type="checkbox"
              checked={draft.scopes.includes(scope)}
              onChange={() => toggleScope(draft, setDraft, scope)}
              aria-label={labelPrefix ? `${labelPrefix}${scope}` : scope}
            />
            <span>{scope}</span>
          </label>
        ))}
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="wrap">
        <p className="state-note">
          Connect Supabase before managing API keys.
        </p>
      </div>
    );
  }

  return (
    <div className="wrap api-key-admin">
      <p className="eyebrow">Admin</p>
      <h1>Agent API Keys</h1>
      <p className="lede">
        Create scoped credentials for existing team Members. New secrets are
        shown once and cannot be recovered later.
      </p>

      {error && (
        <div className="error-banner api-key-error" role="alert">
          <span>{error}</span>
          {!loading && !sessionExpired && (
            <button className="btn" type="button" onClick={() => void load()}>
              Retry list
            </button>
          )}
        </div>
      )}

      <section className="panel api-key-create" aria-labelledby="create-key-title">
        <h2 id="create-key-title">Create API key</h2>
        <form onSubmit={createKey}>
          <div className="api-key-form-grid">
            <label>
              <span>Key name</span>
              <input
                value={createDraft.name}
                maxLength={100}
                required
                onChange={(event) => setCreateDraft({
                  ...createDraft,
                  name: event.target.value,
                })}
              />
            </label>
            <label>
              <span>Member</span>
              <select
                value={createDraft.member_id}
                required
                onChange={(event) => setCreateDraft({
                  ...createDraft,
                  member_id: event.target.value,
                })}
              >
                <option value="">Select a Member</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Expires at (optional)</span>
              <input
                type="datetime-local"
                value={createDraft.expires_at}
                onChange={(event) => setCreateDraft({
                  ...createDraft,
                  expires_at: event.target.value,
                })}
              />
            </label>
          </div>
          <fieldset>
            <legend>Scopes</legend>
            {renderScopeFields(createDraft, setCreateDraft)}
          </fieldset>
          <button
            className="btn primary"
            type="submit"
            disabled={
              creating
              || loading
              || sessionExpired
              || rotationUncertain
              || pendingId !== null
              || !createDraft.name.trim()
              || !createDraft.member_id
            }
          >
            {creating ? "Creating…" : "Create API key"}
          </button>
        </form>
      </section>

      {oneTimeSecret && (
        <section
          className="api-key-secret"
          role="status"
          aria-label="One-time API key secret"
        >
          <div>
            <strong>Copy this secret now</strong>
            <p>
              This {oneTimeSecret.source === "created" ? "new" : "rotated"} key
              secret will not be shown again.
            </p>
          </div>
          <code>{oneTimeSecret.value}</code>
          <div className="api-key-actions">
            <button className="btn primary" type="button" onClick={copySecret}>
              {copied ? "Copied" : "Copy secret"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setOneTimeSecret(null);
                setCopied(false);
              }}
            >
              Dismiss secret
            </button>
          </div>
        </section>
      )}

      <div className="section-label">
        Managed keys<span className="rule" />
      </div>
      {loading ? (
        <p className="state-note">Loading API keys…</p>
      ) : keys.length === 0 ? (
        <div className="empty">No API keys yet.</div>
      ) : (
        <div className="api-key-list">
          {keys.map((key) => {
            const busy = pendingId === key.id;
            const controlsBusy = loading
              || sessionExpired
              || rotationUncertain
              || creating
              || pendingId !== null;
            const status = managedKeyStatus(key, clockNow);
            return (
              <article
                className="panel api-key-card"
                key={key.id}
                aria-label={key.name}
              >
                <div className="api-key-card-head">
                  <div>
                    <h2>{key.name}</h2>
                    <code>{key.key_prefix}</code>
                  </div>
                  <span className={`api-key-status ${status}`}>
                    {status === "active"
                      ? "Active"
                      : status === "expired"
                        ? "Expired"
                        : "Revoked"}
                  </span>
                </div>

                {editingId === key.id ? (
                  <form
                    className="api-key-edit"
                    onSubmit={(event) => void saveEdit(event, key)}
                  >
                    <div className="api-key-form-grid">
                      <label>
                        <span>Key name</span>
                        <input
                          aria-label={`Key name for ${key.name}`}
                          value={editDraft.name}
                          maxLength={100}
                          required
                          onChange={(event) => setEditDraft({
                            ...editDraft,
                            name: event.target.value,
                          })}
                        />
                      </label>
                      <label>
                        <span>Member</span>
                        <select
                          aria-label={`Member for ${key.name}`}
                          value={editDraft.member_id}
                          required
                          onChange={(event) => setEditDraft({
                            ...editDraft,
                            member_id: event.target.value,
                          })}
                        >
                          <option value="">Select a Member</option>
                          {members.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Expires at (optional)</span>
                        <input
                          type="datetime-local"
                          aria-label={`Expires at for ${key.name}`}
                          value={editDraft.expires_at}
                          onChange={(event) => setEditDraft({
                            ...editDraft,
                            expires_at: event.target.value,
                          })}
                        />
                      </label>
                    </div>
                    <fieldset>
                      <legend>Scopes</legend>
                      {renderScopeFields(
                        editDraft,
                        setEditDraft,
                        `Edit scope for ${key.name}: `,
                      )}
                    </fieldset>
                    <div className="api-key-actions">
                      <button
                        className="btn primary"
                        type="submit"
                        disabled={controlsBusy}
                      >
                        {busy ? "Saving…" : "Save key changes"}
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={controlsBusy}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <dl className="api-key-meta">
                      <div>
                        <dt>Member</dt>
                        <dd>{key.member?.name ?? "Deleted Member"}</dd>
                      </div>
                      <div>
                        <dt>Expiry</dt>
                        <dd>
                          {key.expires_at === null
                            ? "Never expires"
                            : formatDate(key.expires_at)}
                        </dd>
                      </div>
                      <div>
                        <dt>Last used</dt>
                        <dd>
                          {key.last_used_at === null
                            ? "Never used"
                            : formatDate(key.last_used_at)}
                        </dd>
                      </div>
                      {key.revoked_at !== null && (
                        <div>
                          <dt>Revoked</dt>
                          <dd>{formatDate(key.revoked_at)}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="api-key-scope-list" aria-label="Scopes">
                      {key.scopes.length === 0
                        ? <span className="muted">No scopes</span>
                        : key.scopes.map((scope) => (
                          <code key={scope}>{scope}</code>
                        ))}
                    </div>
                    <div className="api-key-actions">
                      <button
                        className="btn"
                        type="button"
                        disabled={controlsBusy}
                        aria-label={`Edit ${key.name}`}
                        onClick={() => beginEdit(key)}
                      >
                        Edit
                      </button>
                      {status !== "revoked" && (
                        <>
                          {status === "active" && (
                            <button
                              className="btn"
                              type="button"
                              disabled={controlsBusy}
                              aria-label={`Rotate ${key.name}`}
                              onClick={() => void rotateKey(key)}
                            >
                              {busy ? "Working…" : "Rotate"}
                            </button>
                          )}
                          <button
                            className="btn api-key-revoke"
                            type="button"
                            disabled={controlsBusy}
                            aria-label={`Revoke ${key.name}`}
                            onClick={() => void revokeKey(key)}
                          >
                            {busy ? "Working…" : "Revoke"}
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
