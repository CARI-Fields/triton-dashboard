import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const skillRoot = join(root, ".agents/skills/triton-board-api");
const clientPath = join(skillRoot, "scripts/triton_board_api.py");
const skillPath = join(skillRoot, "SKILL.md");
const openapiPath = join(skillRoot, "references/openapi.yaml");

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function runClient(
  args: string[],
  env: Record<string, string | undefined> = {},
) {
  const processEnv = { ...process.env };
  delete processEnv.TRITON_BOARD_API_URL;
  delete processEnv.TRITON_BOARD_API_KEY;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete processEnv[key];
    else processEnv[key] = value;
  }
  return spawnSync("python3", [clientPath, ...args], {
    cwd: root,
    env: processEnv,
    encoding: "utf8",
  });
}

function runHarness(
  args: string[],
  response: {
    status?: number;
    body?: object;
    headers?: Record<string, string>;
  } = {},
) {
  const harness = String.raw`
import contextlib, http.server, importlib.util, io, json, os, threading

capture = {}
reply = json.loads(os.environ["HARNESS_REPLY"])

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self): self.handle_request()
    def do_PATCH(self): self.handle_request()
    def do_POST(self): self.handle_request()
    def handle_request(self):
        length = int(self.headers.get("Content-Length", "0"))
        capture.update({
            "method": self.command,
            "path": self.path,
            "headers": dict(self.headers),
            "body_hex": self.rfile.read(length).hex(),
        })
        self.send_response(reply.get("status", 200))
        for key, value in reply.get("headers", {}).items():
            self.send_header(key, value)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(reply.get("body", {
            "data": {"ok": True},
            "meta": {"request_id": "req-default"},
        })).encode())
    def log_message(self, *_args): pass

server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
os.environ["TRITON_BOARD_API_URL"] = (
    f"http://127.0.0.1:{server.server_port}/api/agent/v1"
)
os.environ["TRITON_BOARD_API_KEY"] = "tb_live_super-secret"

spec = importlib.util.spec_from_file_location("triton_board_api", os.environ["CLIENT"])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
stdout, stderr = io.StringIO(), io.StringIO()
with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
    try:
        exit_code = module.main(json.loads(os.environ["HARNESS_ARGS"]))
    except SystemExit as error:
        exit_code = int(error.code or 0)
server.shutdown()
thread.join()
print(json.dumps({
    "exit_code": exit_code,
    "stdout": stdout.getvalue(),
    "stderr": stderr.getvalue(),
    "request": capture,
}))
`;
  const result = spawnSync("python3", ["-c", harness], {
    cwd: root,
    env: {
      ...process.env,
      CLIENT: clientPath,
      HARNESS_ARGS: JSON.stringify(args),
      HARNESS_REPLY: JSON.stringify(response),
    },
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as {
    exit_code: number;
    stdout: string;
    stderr: string;
    request: {
      method: string;
      path: string;
      headers: Record<string, string>;
      body_hex: string;
    };
  };
}

describe("Triton Board API skill artifacts", () => {
  it("keeps the skill concise, imperative, and explicit about safe recovery", () => {
    const skill = readFileSync(skillPath, "utf8");
    expect(skill).toContain("GET current resource");
    expect(skill).toContain("If-Match");
    expect(skill).toContain("Idempotency-Key");
    expect(skill).toContain("Never attempt DELETE");
    expect(skill).toContain("TRITON_BOARD_API_KEY");
    expect(skill).toContain("references/openapi.yaml");
    expect(skill).toContain("same target fields changed remotely");
    expect(skill).not.toContain("README");
  });

  it("defines only actual Agent API routes and no destructive operation", () => {
    const openapi = readFileSync(openapiPath, "utf8");
    expect(openapi).toContain("openapi: 3.1.0");
    for (const path of [
      "/capabilities:",
      "/board:",
      "/modules:",
      "/members:",
      "/tasks:",
      "/tasks/{id}:",
      "/tasks/{id}/activity:",
      "/tasks/{id}/experiments:",
      "/experiments:",
      "/experiments/{id}:",
      "/experiments/{id}/attachments:",
      "/attachments/{id}:",
      "/audit:",
    ]) {
      expect(openapi).toContain(path);
    }
    expect(openapi).not.toMatch(/^\s+delete:/m);
    expect(openapi).not.toContain("/batch");
  });

});

describe("Triton Board API client", () => {
  it("advertises only capabilities, get, patch, and post", () => {
    const result = runClient(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("{capabilities,get,patch,post}");
    expect(result.stdout).not.toContain("delete");
    expect(readFileSync(clientPath, "utf8")).not.toContain("print(api_key");
  });

  it("requires both environment variables without echoing the key", () => {
    const missing = runClient(["capabilities"]);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("TRITON_BOARD_API_URL");

    const key = "tb_live_never-print-this";
    const unreachable = runClient(["capabilities"], {
      TRITON_BOARD_API_URL: "http://127.0.0.1:1/api/agent/v1",
      TRITON_BOARD_API_KEY: key,
    });
    expect(`${unreachable.stdout}${unreachable.stderr}`).not.toContain(key);
  });

  it.each([
    ["https://evil.example/tasks", "absolute"],
    ["//evil.example/tasks", "scheme-relative"],
    ["../admin", "traversal"],
    ["tasks/../../admin", "traversal"],
    ["tasks#secret", "fragment"],
    ["tasks\u000aX-Evil: yes", "control"],
  ])("rejects unsafe path %j before dispatch", (path) => {
    const result = runClient(["get", path], {
      TRITON_BOARD_API_URL: "http://127.0.0.1:1/api/agent/v1",
      TRITON_BOARD_API_KEY: "tb_live_safe",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("path");
  });

  it("joins relative paths beneath the full API base and emits safe metadata", () => {
    const result = runHarness(["get", "tasks?status=todo"], {
      headers: { ETag: '"2026-07-29T00:00:00Z"' },
      body: {
        data: { items: [], next_cursor: null },
        meta: { request_id: "req-get" },
      },
    });
    expect(result.exit_code).toBe(0);
    expect(result.request.path).toBe("/api/agent/v1/tasks?status=todo");
    expect(result.request.headers.Authorization).toBe(
      "Bearer tb_live_super-secret",
    );
    expect(result.stdout).toContain("status: 200");
    expect(result.stdout).toContain("request_id: req-get");
    expect(result.stdout).toContain('etag: "2026-07-29T00:00:00Z"');
    expect(result.stdout).not.toContain("tb_live_super-secret");
  });

  it("sends the exact PATCH envelope and quoted If-Match", () => {
    const result = runHarness([
      "patch",
      "tasks/11111111-1111-1111-1111-111111111111",
      "--etag",
      '"2026-07-29T00:00:00Z"',
      "--changes-json",
      '{"title":"Minimal"}',
    ]);
    expect(result.exit_code).toBe(0);
    expect(result.request.method).toBe("PATCH");
    expect(result.request.headers["If-Match"]).toBe(
      '"2026-07-29T00:00:00Z"',
    );
    expect(JSON.parse(
      Buffer.from(result.request.body_hex, "hex").toString("utf8"),
    )).toEqual({ changes: { title: "Minimal" } });
  });

  it("uses a supplied canonical UUID as the stable POST key", () => {
    const key = "11111111-1111-4111-8111-111111111111";
    const result = runHarness([
      "post",
      "tasks/11111111-1111-1111-1111-111111111111/activity",
      "--idempotency-key",
      key,
      "--body-json",
      '{"text":"Profile this"}',
    ]);
    expect(result.exit_code).toBe(0);
    expect(result.request.headers["Idempotency-Key"]).toBe(key);
    expect(result.stdout).toContain(`idempotency_key: ${key}`);
    expect(JSON.parse(
      Buffer.from(result.request.body_hex, "hex").toString("utf8"),
    )).toEqual({ text: "Profile this" });
  });

  it("prints a generated canonical UUID before a transport failure", () => {
    const result = runClient([
      "post",
      "tasks/11111111-1111-1111-1111-111111111111/activity",
      "--body-json",
      '{"text":"Profile this"}',
    ], {
      TRITON_BOARD_API_URL: "http://127.0.0.1:1/api/agent/v1",
      TRITON_BOARD_API_KEY: "tb_live_safe",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(
      /^idempotency_key: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\n/,
    );
  });

  it("does not print an idempotency key for a locally invalid POST", () => {
    const result = runClient([
      "post",
      "tasks/11111111-1111-1111-1111-111111111111/activity",
      "--body-json",
      "[]",
    ], {
      TRITON_BOARD_API_URL: "http://127.0.0.1:1/api/agent/v1",
      TRITON_BOARD_API_KEY: "tb_live_safe",
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--body-json must be a JSON object");
  });

  it("fails closed on redirects instead of forwarding the bearer key", () => {
    const result = runHarness(["capabilities"], {
      status: 302,
      headers: { Location: "https://example.invalid/steal" },
      body: {},
    });
    expect(result.exit_code).not.toBe(0);
    expect(result.stdout).toContain("status: 302");
    expect(result.stdout).not.toContain("tb_live_super-secret");
  });

  it("reports structured API errors without dumping credentials", () => {
    const result = runHarness(["capabilities"], {
      status: 429,
      headers: { "Retry-After": "60" },
      body: {
        error: {
          code: "WRITE_RATE_LIMITED",
          message: "Slow down.",
          request_id: "req-error",
          retryable: true,
        },
      },
    });
    expect(result.exit_code).toBe(1);
    expect(result.stdout).toContain("status: 429");
    expect(result.stdout).toContain("request_id: req-error");
    expect(result.stdout).toContain("retry_after: 60");
    expect(result.stdout).not.toContain("tb_live_super-secret");
  });

  it("encodes the actual Attachment multipart write with file and caption", () => {
    const directory = mkdtempSync(join(tmpdir(), "triton-board-client-"));
    tempDirectories.push(directory);
    const file = join(directory, "tiny.png");
    writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const key = "22222222-2222-4222-8222-222222222222";
    const result = runHarness([
      "post",
      "experiments/11111111-1111-1111-1111-111111111111/attachments",
      "--idempotency-key",
      key,
      "--file",
      file,
      "--caption",
      "profile",
    ]);
    const body = Buffer.from(result.request.body_hex, "hex").toString("latin1");
    expect(result.exit_code).toBe(0);
    expect(result.request.headers["Content-Type"]).toMatch(
      /^multipart\/form-data; boundary=/,
    );
    expect(body).toContain('name="file"; filename="tiny.png"');
    expect(body).toContain("Content-Type: image/png");
    expect(body).toContain('name="caption"');
    expect(body).toContain("profile");
  });
});
