import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isRfc3339Timestamp } from "../../lib/agent-api/timestamps";

const root = resolve(import.meta.dirname, "../..");
const skillRoot = join(root, ".agents/skills/triton-board-api");
const clientPath = join(skillRoot, "scripts/triton_board_api.py");
const skillPath = join(skillRoot, "SKILL.md");
const openapiPath = join(skillRoot, "references/openapi.yaml");
const openaiPath = join(skillRoot, "agents/openai.yaml");
const TEST_API_KEY =
  "tb_live_AAECAwQF_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";

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
    body?: object | string;
    headers?: Record<string, string>;
    contentType?: string;
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
        content_type = reply.get("contentType", "application/json")
        if content_type is not None:
            self.send_header("Content-Type", content_type)
        self.end_headers()
        body = reply.get("body", {
            "data": {"ok": True},
            "meta": {"request_id": "req-default"},
        })
        if isinstance(body, str):
            self.wfile.write(body.encode())
        else:
            self.wfile.write(json.dumps(body).encode())
    def log_message(self, *_args): pass

server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
os.environ["TRITON_BOARD_API_URL"] = (
    f"http://127.0.0.1:{server.server_port}/api/agent/v1"
)
os.environ["TRITON_BOARD_API_KEY"] = os.environ["HARNESS_KEY"]

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
      HARNESS_KEY: TEST_API_KEY,
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

interface OpenApiOperation {
  method: "get" | "patch" | "post";
  operationId: string;
  path: string;
  responses: string[];
  scope: string | null;
}

function parseOpenApiOperations(source: string): OpenApiOperation[] {
  const operations: OpenApiOperation[] = [];
  let path = "";
  let current: OpenApiOperation | null = null;
  let inResponses = false;
  const finish = () => {
    if (current !== null) operations.push(current);
    current = null;
  };

  for (const line of source.split("\n")) {
    if (line === "components:") break;
    const pathMatch = line.match(/^  (\/.*):$/);
    if (pathMatch) {
      finish();
      path = pathMatch[1];
      inResponses = false;
      continue;
    }
    const methodMatch = line.match(/^    (get|patch|post):$/);
    if (methodMatch) {
      finish();
      current = {
        method: methodMatch[1] as OpenApiOperation["method"],
        operationId: "",
        path,
        responses: [],
        scope: null,
      };
      inResponses = false;
      continue;
    }
    if (current === null) continue;
    const operationId = line.match(/^      operationId: (\S+)$/);
    if (operationId) current.operationId = operationId[1];
    const scope = line.match(/^      x-required-scope: (\S+)$/);
    if (scope) current.scope = scope[1];
    if (line === "      responses:") {
      inResponses = true;
      continue;
    }
    if (inResponses) {
      const status = line.match(/^        "(\d{3})":$/);
      if (status) current.responses.push(status[1]);
      if (/^      \S/.test(line)) inResponses = false;
    }
  }
  finish();
  return operations;
}

function componentBlock(
  source: string,
  section: string,
  name: string,
): string {
  const lines = source.split("\n");
  const sectionIndex = lines.indexOf(`  ${section}:`);
  expect(sectionIndex).toBeGreaterThan(-1);
  const start = lines.findIndex(
    (line, index) => index > sectionIndex && line === `    ${name}:`,
  );
  expect(start).toBeGreaterThan(sectionIndex);
  let end = start + 1;
  while (
    end < lines.length
    && (!/^\s*\S/.test(lines[end]) || lines[end].match(/^ */)![0].length > 4)
  ) {
    end += 1;
  }
  return lines.slice(start, end).join("\n");
}

function operationBlock(source: string, operationId: string): string {
  const lines = source.split("\n");
  const operationIdIndex = lines.indexOf(`      operationId: ${operationId}`);
  expect(operationIdIndex).toBeGreaterThan(-1);
  let start = operationIdIndex;
  while (start >= 0 && !/^    (?:get|patch|post):$/.test(lines[start])) {
    start -= 1;
  }
  expect(start).toBeGreaterThan(-1);
  let end = start + 1;
  while (
    end < lines.length
    && !/^    (?:get|patch|post):$/.test(lines[end])
    && !/^  \//.test(lines[end])
    && lines[end] !== "components:"
  ) {
    end += 1;
  }
  return lines.slice(start, end).join("\n");
}

function operationResponseSchema(
  operation: string,
  status: string,
): string | undefined {
  const lines = operation.split("\n");
  const start = lines.indexOf(`        "${status}":`);
  expect(start).toBeGreaterThan(-1);
  let end = start + 1;
  while (end < lines.length && !/^        "\d{3}":$/.test(lines[end])) {
    end += 1;
  }
  return lines
    .slice(start, end)
    .join("\n")
    .match(/\$ref: "#\/components\/schemas\/([^"]+)"/)?.[1];
}

function schemaPattern(source: string, name: string): RegExp {
  const block = componentBlock(source, "schemas", name);
  const pattern = block.match(/^      pattern: '(.+)'$/m)?.[1];
  if (pattern === undefined) {
    throw new Error(`${name} must define a single-quoted pattern.`);
  }
  return new RegExp(pattern);
}

function directSchemaProperties(block: string): string[] {
  return [...block.matchAll(/^        ([a-z][a-z0-9_]*):$/gm)]
    .map((match) => match[1])
    .sort();
}

function directRequiredFields(block: string): string[] {
  const inline = block.match(/^      required: \[([^\]]+)\]$/m)?.[1];
  if (inline !== undefined) {
    return inline.split(",").map((field) => field.trim()).sort();
  }
  const lines = block.split("\n");
  const start = lines.indexOf("      required:");
  expect(start).toBeGreaterThan(-1);
  const required: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^        - ([a-z][a-z0-9_]*)$/);
    if (!match) break;
    required.push(match[1]);
  }
  return required.sort();
}

function componentSchemaRefs(block: string): string[] {
  return [...block.matchAll(
    /\$ref: "#\/components\/schemas\/([A-Za-z][A-Za-z0-9]+)"/g,
  )].map((match) => match[1]);
}

function auditActionBranches(block: string): string[] {
  return block.split(/^            - type: object$/m).slice(1);
}

describe("Triton Board API skill artifacts", () => {
  it("keeps the skill concise, imperative, and explicit about safe recovery", () => {
    const skill = readFileSync(skillPath, "utf8");
    expect(skill.match(/^description: (.+)$/m)?.[1]).toBe(
      "Use when an AI agent needs to read Triton Board capabilities, board data, tasks, experiments, activity, attachments, or audit records; patch tasks, experiments, or attachment captions; or create experiments, activity comments, or experiment attachments through the Triton Board Agent API.",
    );
    expect(skill).toContain("GET current resource");
    expect(skill).toContain("If-Match");
    expect(skill).toContain("Idempotency-Key");
    expect(skill).toContain("Never attempt DELETE");
    expect(skill).toContain("TRITON_BOARD_API_KEY");
    expect(skill).toContain("references/openapi.yaml");
    expect(skill).toContain("same target fields changed remotely");
    expect(skill).not.toContain("README");
  });

  it("uses a trusted Attachment version without requiring a preflight GET", () => {
    const skill = readFileSync(skillPath, "utf8");
    expect(skill).toContain("matching operation recipe");
    expect(skill).toContain("For GET/read:");
    expect(skill).toContain("For Task PATCH:");
    expect(skill).toContain("For Experiment Value PATCH:");
    expect(skill).toContain("For Attachment PATCH:");
    expect(skill).toContain("For POST:");
    const attachmentPatch = skill.slice(
      skill.indexOf("For Attachment PATCH:"),
      skill.indexOf("For POST:"),
    );
    expect(attachmentPatch).toContain(
      "trusted current target `attachment.updated_at` supplied in context",
    );
    expect(attachmentPatch).toContain(
      "Do not GET when that trusted target version is available",
    );
    expect(attachmentPatch).toContain(
      "Attachment PATCH does not require `board:read`",
    );
    expect(attachmentPatch).toContain("quote");
    expect(attachmentPatch).toContain("never the parent Experiment ETag");
    expect(attachmentPatch).not.toMatch(
      /^.*For Attachment PATCH: GET the parent Experiment/m,
    );
  });

  it("uses the only available Attachment fallback or stops", () => {
    const skill = readFileSync(skillPath, "utf8");
    const attachmentPatch = skill.slice(
      skill.indexOf("For Attachment PATCH:"),
      skill.indexOf("For POST:"),
    );
    expect(attachmentPatch).toContain(
      "Experiment-linked and `board:read` is available",
    );
    expect(attachmentPatch).toContain(
      "GET the parent Experiment and select the target Attachment",
    );
    expect(attachmentPatch).toContain(
      "Direct Task Attachments have no Agent GET",
    );
    expect(attachmentPatch).toContain(
      "stop if no trusted current target `attachment.updated_at` is available",
    );
    expect(skill).toContain("matching PATCH version-source rule");
    expect(skill).not.toContain("On `412`, GET the latest resource");
    expect(skill).not.toContain("On a PATCH transport failure, GET the resource");
  });

  it("separates PATCH and POST prerequisites and verification", () => {
    const skill = readFileSync(skillPath, "utf8");
    expect(skill).toContain(
      "POST does not require `board:read` or a preflight GET",
    );
    expect(skill).toContain(
      "Optional GET verification requires `board:read`",
    );
    expect(skill).toContain("transport or `5xx`");
    expect(skill).toContain("On `409`, stop");
  });

  it("defines the exact route, scope, and response matrix", () => {
    const openapi = readFileSync(openapiPath, "utf8");
    const operations = parseOpenApiOperations(openapi);
    const byOperation = Object.fromEntries(
      operations.map((operation) => [operation.operationId, operation]),
    );
    const responseMatrix: Record<string, string[]> = {
      getCapabilities: ["200", "400", "401", "500"],
      getBoardSummary: ["200", "400", "401", "403", "500"],
      listModules: ["200", "400", "401", "403", "500"],
      listMembers: ["200", "400", "401", "403", "500"],
      listTasks: ["200", "400", "401", "403", "500"],
      getTask: ["200", "400", "401", "403", "404", "500"],
      patchTask: ["200", "400", "401", "403", "412", "413", "422", "429", "500"],
      listTaskActivity: ["200", "400", "401", "403", "404", "500"],
      appendTaskActivity: ["200", "201", "400", "401", "403", "409", "413", "422", "429", "500"],
      createTaskExperiment: ["200", "201", "400", "401", "403", "409", "413", "422", "429", "500"],
      listExperiments: ["200", "400", "401", "403", "500"],
      getExperiment: ["200", "400", "401", "403", "404", "500"],
      createExperimentAttachment: ["200", "201", "400", "401", "403", "404", "409", "422", "429", "500"],
      patchAttachment: ["200", "400", "401", "403", "404", "412", "413", "422", "429", "500"],
      listAudit: ["200", "400", "401", "403", "500"],
      listTemplates: ["200"],
      getTemplateSchema: ["200", "404"],
      getTemplateCompareSource: ["200"],
      patchExperimentValue: ["200", "409"],
      archiveExperiment: ["200", "422"],
      unarchiveExperiment: ["200"],
      listExperimentVersions: ["200"],
      restoreExperimentVersion: ["200"],
    };
    const scopeMatrix: Record<string, string | null> = {
      getCapabilities: null,
      getBoardSummary: "board:read",
      listModules: "board:read",
      listMembers: "board:read",
      listTasks: "board:read",
      getTask: "board:read",
      patchTask: "tasks:write",
      listTaskActivity: "board:read",
      appendTaskActivity: "activity:append",
      createTaskExperiment: "experiments:write",
      listExperiments: "board:read",
      getExperiment: "board:read",
      createExperimentAttachment: "attachments:write",
      patchAttachment: "attachments:write",
      listAudit: "audit:read",
      listTemplates: "board:read",
      getTemplateSchema: "board:read",
      getTemplateCompareSource: "board:read",
      patchExperimentValue: "experiments:write",
      archiveExperiment: "experiments:write",
      unarchiveExperiment: "experiments:write",
      listExperimentVersions: "board:read",
      restoreExperimentVersion: "experiments:write",
    };

    expect(new Set(operations.map(({ path }) => path)).size).toBe(21);
    expect(operations).toHaveLength(23);
    expect(new Set(operations.map(({ operationId }) => operationId)).size)
      .toBe(23);
    expect(Object.keys(byOperation).sort()).toEqual(
      Object.keys(responseMatrix).sort(),
    );
    for (const [operationId, statuses] of Object.entries(responseMatrix)) {
      expect(byOperation[operationId].responses.sort()).toEqual(
        [...statuses].sort(),
      );
      expect(byOperation[operationId].scope).toBe(scopeMatrix[operationId]);
    }
    expect(openapi).not.toMatch(/^\s+delete:/m);
    expect(openapi).not.toContain("/batch");
  });

  it("resolves component refs and models exact enums and success metadata", () => {
    const openapi = readFileSync(openapiPath, "utf8");
    const definitions = new Set<string>();
    let section = "";
    for (const line of openapi.split("\n")) {
      const sectionMatch = line.match(/^  ([A-Za-z]+):$/);
      if (sectionMatch) section = sectionMatch[1];
      const definition = line.match(/^    ([A-Za-z][A-Za-z0-9]+):$/);
      if (section && definition) {
        definitions.add(`#/components/${section}/${definition[1]}`);
      }
    }
    const refs = [...openapi.matchAll(/\$ref: "([^"]+)"/g)]
      .map((match) => match[1]);
    expect(refs.length).toBeGreaterThan(200);
    expect(refs.filter((ref) => !definitions.has(ref))).toEqual([]);
    expect(componentBlock(openapi, "schemas", "TaskStatus"))
      .toContain("enum: [todo, in_progress, done, blocked]");
    expect(componentBlock(openapi, "schemas", "ExperimentStatus"))
      .toContain(
        "enum: [planned, running, analyzing, completed, blocked, cancelled]",
      );
    const scope = componentBlock(openapi, "schemas", "Scope");
    for (const value of [
      "board:read",
      "tasks:write",
      "experiments:write",
      "attachments:write",
      "activity:append",
      "audit:read",
    ]) {
      expect(scope).toContain(`- ${value}`);
    }
    expect(componentBlock(openapi, "schemas", "SuccessMeta"))
      .not.toContain("idempotency_replayed");
    expect(componentBlock(openapi, "schemas", "CreatedMeta"))
      .toContain("const: false");
    expect(componentBlock(openapi, "schemas", "ReplayedMeta"))
      .toContain("const: true");
    const expectedPostResponses = {
      appendTaskActivity: {
        "200": "ActivityReplayedSuccess",
        "201": "ActivityCreatedSuccess",
      },
      createTaskExperiment: {
        "200": "ExperimentReplayedSuccess",
        "201": "ExperimentCreatedSuccess",
      },
      createExperimentAttachment: {
        "200": "AttachmentReplayedSuccess",
        "201": "AttachmentCreatedSuccess",
      },
    };
    for (const [operationId, responseSchemas] of Object.entries(
      expectedPostResponses,
    )) {
      const operation = operationBlock(openapi, operationId);
      for (const [status, schema] of Object.entries(responseSchemas)) {
        expect(operationResponseSchema(operation, status)).toBe(schema);
      }
    }

    expect(componentBlock(openapi, "schemas", "Timestamp"))
      .toContain("format: date-time");
    expect(componentBlock(openapi, "parameters", "IfMatch"))
      .toContain('$ref: "#/components/schemas/QuotedETag"');
    expect(componentBlock(openapi, "parameters", "UpdatedAfter"))
      .toContain('$ref: "#/components/schemas/Timestamp"');
    expect(componentBlock(openapi, "headers", "ETag"))
      .toContain('$ref: "#/components/schemas/QuotedETag"');

  });

  it("documents every current Task response and PATCH metadata field", () => {
    const openapi = readFileSync(openapiPath, "utf8");
    const mutation = componentBlock(openapi, "schemas", "TaskMutation");
    const mutationFields = [
      "id",
      "module_id",
      "title",
      "status",
      "notes",
      "tags",
      "priority",
      "due_date",
      "position",
      "created_at",
      "updated_at",
    ];
    expect(directSchemaProperties(mutation)).toEqual(
      [...mutationFields].sort(),
    );
    expect(directRequiredFields(mutation)).toEqual(
      [...mutationFields].sort(),
    );
    expect(mutation).toMatch(
      /module_id:\n\s+oneOf:\n\s+- \$ref: "#\/components\/schemas\/Uuid"\n\s+- type: "null"/,
    );
    const task = componentBlock(openapi, "schemas", "Task");
    expect(task).toMatch(
      /assignees:\n\s+type: array\n\s+items:\n\s+type: string/,
    );
    expect(task).not.toContain(
      '$ref: "#/components/schemas/Uuid"',
    );

    const patch = componentBlock(openapi, "schemas", "TaskPatchEnvelope");
    for (const field of [
      "title",
      "status",
      "notes",
      "tags",
      "priority",
      "due_date",
      "position",
    ]) {
      expect(patch).toMatch(new RegExp(`^            ${field}:$`, "m"));
    }
    expect(patch).not.toMatch(/^            (?:module_id|assignees):$/m);
  });

  it("models the server's Gregorian timestamp contract for values and ETags", () => {
    const openapi = readFileSync(openapiPath, "utf8");
    const timestamp = schemaPattern(openapi, "Timestamp");
    const quotedEtag = schemaPattern(openapi, "QuotedETag");
    const cases: Array<[string, boolean]> = [
      ["0100-01-01T00:00:00Z", true],
      ["1900-02-28T23:59:59Z", true],
      ["2000-02-29T12:34:56.123456789+15:59", true],
      ["2004-02-29T00:00:00-15:59", true],
      ["9999-12-31T23:59:59Z", true],
      ["0000-01-01T00:00:00Z", false],
      ["0099-12-31T23:59:59Z", false],
      ["10000-01-01T00:00:00Z", false],
      ["1900-02-29T00:00:00Z", false],
      ["2001-02-29T00:00:00Z", false],
      ["2100-02-29T00:00:00Z", false],
      ["2000-02-30T00:00:00Z", false],
      ["2000-04-31T00:00:00Z", false],
      ["2000-00-01T00:00:00Z", false],
      ["2000-13-01T00:00:00Z", false],
      ["2000-01-00T00:00:00Z", false],
      ["2000-01-01T24:00:00Z", false],
      ["2000-01-01T23:60:00Z", false],
      ["2000-01-01T23:59:60Z", false],
      ["2000-01-01T00:00:00.1234567890Z", false],
      ["2000-01-01T00:00:00+16:00", false],
      ["2000-01-01T00:00:00+15:60", false],
    ];
    for (const [value, expected] of cases) {
      expect(isRfc3339Timestamp(value), value).toBe(expected);
      expect(timestamp.test(value), value).toBe(expected);
      expect(quotedEtag.test(`"${value}"`), `"${value}"`).toBe(expected);
    }
    expect(timestamp.test('"2000-02-29T00:00:00Z"')).toBe(false);
    expect(quotedEtag.test("2000-02-29T00:00:00Z")).toBe(false);
  });

  it("uses exact resource snapshots and discriminated audit variants", () => {
    const openapi = readFileSync(openapiPath, "utf8");
    const snapshotFields: Record<string, string[]> = {
      TaskAuditSnapshot: [
        "id",
        "module_id",
        "title",
        "status",
        "notes",
        "tags",
        "priority",
        "due_date",
        "position",
        "created_at",
        "updated_at",
      ],
      ExperimentAuditSnapshot: [
        "id",
        "experiment_no",
        "task_id",
        "owner_id",
        "name",
        "status",
        "template_id",
        "archived_at",
        "core_revision",
        "position",
        "started_at",
        "completed_at",
        "created_at",
        "updated_at",
      ],
      AttachmentAuditSnapshot: [
        "id",
        "task_id",
        "experiment_id",
        "url",
        "path",
        "caption",
        "position",
        "created_at",
        "updated_at",
      ],
      ActivityAuditSnapshot: [
        "id",
        "task_id",
        "experiment_id",
        "text",
        "kind",
        "created_at",
      ],
    };
    for (const [name, fields] of Object.entries(snapshotFields)) {
      const block = componentBlock(openapi, "schemas", name);
      expect(block).toContain("additionalProperties: false");
      expect(directSchemaProperties(block)).toEqual([...fields].sort());
      expect(directRequiredFields(block)).toEqual([...fields].sort());
    }

    const auditEntry = componentBlock(openapi, "schemas", "AuditEntry");
    expect(componentSchemaRefs(auditEntry)).toEqual([
      "TaskAuditEntry",
      "ExperimentAuditEntry",
      "AttachmentAuditEntry",
      "ActivityAuditEntry",
    ]);
    expect(auditEntry).toContain("propertyName: resource_type");
    for (const [resourceType, snapshot] of [
      ["task", "TaskAuditSnapshot"],
      ["experiment", "ExperimentAuditSnapshot"],
      ["attachment", "AttachmentAuditSnapshot"],
      ["activity", "ActivityAuditSnapshot"],
    ] as const) {
      const variant = componentBlock(
        openapi,
        "schemas",
        `${resourceType[0].toUpperCase()}${resourceType.slice(1)}AuditEntry`,
      );
      expect(variant).toContain(
        '$ref: "#/components/schemas/AuditEntryBase"',
      );
      expect(variant).toContain(`const: ${resourceType}`);
      expect(variant).toContain(
        `$ref: "#/components/schemas/${snapshot}"`,
      );
      const snapshotRefs = componentSchemaRefs(variant)
        .filter((ref) => ref.endsWith("AuditSnapshot"));
      expect(snapshotRefs.length).toBeGreaterThan(0);
      expect(new Set(snapshotRefs)).toEqual(new Set([snapshot]));
      expect(variant).toContain("unevaluatedProperties: false");
    }
    expect(openapi).not.toMatch(/^    AuditSnapshot:$/m);
    expect(openapi).not.toMatch(/^    NullableAuditSnapshot:$/m);
  });

  it("couples create and patch audit state with the recorded status", () => {
    const openapi = readFileSync(openapiPath, "utf8");
    for (const [entry, snapshot] of [
      ["ExperimentAuditEntry", "ExperimentAuditSnapshot"],
      ["AttachmentAuditEntry", "AttachmentAuditSnapshot"],
    ] as const) {
      const branches = auditActionBranches(
        componentBlock(openapi, "schemas", entry),
      );
      expect(branches).toHaveLength(2);
      const create = branches.find((branch) => branch.includes("const: create"));
      const patch = branches.find((branch) => branch.includes("const: patch"));
      expect(create).toBeDefined();
      expect(create).toMatch(/before_state:\n\s+type: "null"/);
      expect(create).toContain(
        `after_state:\n                  $ref: "#/components/schemas/${snapshot}"`,
      );
      expect(create).toMatch(/response_status:\n\s+type: integer\n\s+const: 201/);
      expect(patch).toBeDefined();
      expect(patch).toContain(
        `before_state:\n                  $ref: "#/components/schemas/${snapshot}"`,
      );
      expect(patch).toContain(
        `after_state:\n                  $ref: "#/components/schemas/${snapshot}"`,
      );
      expect(patch).toMatch(/response_status:\n\s+type: integer\n\s+const: 200/);
    }
  });

  it("keeps generated UI metadata exact without an external validator", () => {
    const openai = readFileSync(openaiPath, "utf8");
    const fields = Object.fromEntries(
      openai.split("\n").flatMap((line) => {
        const match = line.match(/^  ([a-z_]+): "(.*)"$/);
        return match ? [[match[1], match[2]]] : [];
      }),
    );
    expect(fields).toEqual({
      default_prompt:
        "Use $triton-board-api to inspect a Task and apply a minimal, concurrency-safe update.",
      display_name: "Triton Board API",
      short_description: "Safely inspect and update Triton Board data",
    });
  });

  it("documents the template-aware endpoints", () => {
    const openapi = readFileSync(openapiPath, "utf8");
    expect(openapi).toContain("operationId: listTemplates");
    expect(openapi).toContain("operationId: getTemplateSchema");
    expect(openapi).toContain("/templates/{id}/compare");
    expect(openapi).toContain("operationId: patchExperimentValue");
    expect(openapi).toContain("/experiments/{id}/archive");
    expect(openapi).toContain("/experiments/{id}/unarchive");
    expect(openapi).toContain("operationId: restoreExperimentVersion");
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

    const key = TEST_API_KEY;
    const unreachable = runClient(["capabilities"], {
      TRITON_BOARD_API_URL: "http://127.0.0.1:1/api/agent/v1",
      TRITON_BOARD_API_KEY: key,
    });
    expect(`${unreachable.stdout}${unreachable.stderr}`).not.toContain(key);
  });

  it("rejects a malformed API key without leaking it or a traceback", () => {
    const malformed = `${TEST_API_KEY}\n`;
    const result = runClient(["capabilities"], {
      TRITON_BOARD_API_URL: "http://127.0.0.1:1/api/agent/v1",
      TRITON_BOARD_API_KEY: malformed,
    });
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(2);
    expect(output).toContain("TRITON_BOARD_API_KEY");
    expect(output).not.toContain(TEST_API_KEY);
    expect(output).not.toContain("Traceback");
  });

  it.each([
    [" http://127.0.0.1/api/agent/v1", "whitespace"],
    ["http://127.0.0.1/api/agent/v1 ", "whitespace"],
    ["http://127.0.0.1\\evil/api/agent/v1", "backslash"],
    ["http://127.0.0.1/api/agent/v1?", "query marker"],
    ["http://127.0.0.1/api/agent/v1#", "fragment marker"],
    ["http://:8080/api/agent/v1", "hostname"],
    ["http://127.0.0.1:/api/agent/v1", "empty port"],
    ["http://127.0.0.1:0/api/agent/v1", "zero port"],
    ["http://127.0.0.1:bad/api/agent/v1", "port"],
  ])("rejects an unsafe API base containing %s", (base) => {
    const result = runClient(["capabilities"], {
      TRITON_BOARD_API_URL: base,
      TRITON_BOARD_API_KEY: TEST_API_KEY,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("TRITON_BOARD_API_URL");
    expect(result.stderr).not.toContain("Traceback");
  });

  it.each([
    ["https://evil.example/tasks", "absolute"],
    ["//evil.example/tasks", "scheme-relative"],
    ["../admin", "traversal"],
    ["tasks/../../admin", "traversal"],
    ["tasks#secret", "fragment"],
    ["tasks\u000aX-Evil: yes", "control"],
    ["%252e%252e/admin", "recursively encoded traversal"],
    ["tasks/%252fadmin", "recursively encoded slash"],
    ["tasks/%255cadmin", "recursively encoded backslash"],
    ["//[", "malformed authority"],
  ])("rejects unsafe path %j before dispatch", (path) => {
    const result = runClient(["get", path], {
      TRITON_BOARD_API_URL: "http://127.0.0.1:1/api/agent/v1",
      TRITON_BOARD_API_KEY: TEST_API_KEY,
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("path");
    expect(result.stderr).not.toContain("Traceback");
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
      `Bearer ${TEST_API_KEY}`,
    );
    expect(result.stdout).toContain("status: 200");
    expect(result.stdout).toContain("request_id: req-get");
    expect(result.stdout).toContain('etag: "2026-07-29T00:00:00Z"');
    expect(result.stdout).not.toContain(TEST_API_KEY);
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
      TRITON_BOARD_API_KEY: TEST_API_KEY,
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
      TRITON_BOARD_API_KEY: TEST_API_KEY,
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
    expect(result.stdout).not.toContain(TEST_API_KEY);
  });

  it("retains HTTP metadata for a non-JSON error without printing its body", () => {
    const result = runHarness(["capabilities"], {
      status: 429,
      headers: {
        ETag: '"2026-07-29T00:00:00Z"',
        "Retry-After": "60",
      },
      contentType: "text/plain",
      body: "proxy secret body must not be printed",
    });
    expect(result.exit_code).toBe(1);
    expect(result.stdout).toContain("status: 429");
    expect(result.stdout).toContain('etag: "2026-07-29T00:00:00Z"');
    expect(result.stdout).toContain("retry_after: 60");
    expect(result.stdout).toContain('"code": "NON_JSON_RESPONSE"');
    expect(result.stdout).toContain('"retryable": true');
    expect(result.stdout).not.toContain("proxy secret body");
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

  it("sanitizes every multipart filename header control and backslash", () => {
    const directory = mkdtempSync(join(tmpdir(), "triton-board-client-"));
    tempDirectories.push(directory);
    const file = join(directory, 'bad\\name\t"\u0085.png');
    writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const result = runHarness([
      "post",
      "experiments/11111111-1111-1111-1111-111111111111/attachments",
      "--idempotency-key",
      "33333333-3333-4333-8333-333333333333",
      "--file",
      file,
    ]);
    const body = Buffer.from(result.request.body_hex, "hex").toString("latin1");
    const filename = body.match(/filename="([^"]+)"/)?.[1];
    expect(result.exit_code).toBe(0);
    expect(filename).toBe("bad_name___.png");
    expect(filename).not.toMatch(/[\p{Cc}\\]/u);
  });

  it("validates the bytes read instead of trusting the earlier file stat", () => {
    const probe = String.raw`
import importlib.util, json, os
spec = importlib.util.spec_from_file_location("client", os.environ["CLIENT"])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class FakePath:
    name = "race.png"
    suffix = ".png"
    def stat(self):
        return type("Stat", (), {"st_size": 1})()
    def read_bytes(self):
        return b"x" * (module.MAX_ATTACHMENT_BYTES + 1)
module.Path = lambda _value: FakePath()
try:
    module._multipart("ignored.png", "")
except module.ClientError as error:
    print(json.dumps({"error": str(error)}))
else:
    print(json.dumps({"error": None}))
`;
    const result = spawnSync("python3", ["-c", probe], {
      cwd: root,
      env: { ...process.env, CLIENT: clientPath },
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      error: "attachment must be between 1 byte and 10 MiB.",
    });
  });
});
