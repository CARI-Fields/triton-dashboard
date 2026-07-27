import { describe, expect, it } from "vitest";
import {
  normalizeTags,
  newTaskToStorage,
  tagTone,
  taskFromStorage,
  taskPatchToStorage,
  taskTypeFromStorage,
  taskTypePatchToStorage,
} from "@/lib/tasks/model";

describe("task domain mapping", () => {
  it("maps legacy storage names to Type and Owner terminology", () => {
    expect(taskFromStorage({
      id: "task-1",
      module_id: "type-1",
      title: "Benchmark kernels",
      status: "in_progress",
      assignees: ["Maya", "Yubai"],
      notes: "Measure pass@1",
      tags: ["NPU"],
      priority: "high",
      due_date: "2026-08-01",
      position: 0,
      created_at: "2026-07-27T00:00:00Z",
      updated_at: "2026-07-27T00:00:00Z",
    })).toEqual({
      id: "task-1",
      typeId: "type-1",
      title: "Benchmark kernels",
      status: "in_progress",
      owners: ["Maya", "Yubai"],
      notes: "Measure pass@1",
      tags: ["NPU"],
      priority: "high",
      dueDate: "2026-08-01",
      position: 0,
      created_at: "2026-07-27T00:00:00Z",
      updated_at: "2026-07-27T00:00:00Z",
    });
  });

  it("maps domain patches back to storage without inventing absent fields", () => {
    expect(taskPatchToStorage({})).toEqual({});
    expect(taskPatchToStorage({
      typeId: null,
      title: "",
      status: "blocked",
      owners: [],
      notes: "",
      tags: [],
      priority: "urgent",
      dueDate: null,
      position: 0,
    })).toEqual({
      module_id: null,
      title: "",
      status: "blocked",
      assignees: [],
      notes: "",
      tags: [],
      priority: "urgent",
      due_date: null,
      position: 0,
    });
  });

  it("normalizes tags and assigns a stable case-insensitive visual tone", () => {
    expect(normalizeTags([
      " NPU ",
      "npu",
      "",
      "Verifier",
      " verifier ",
      "Kernel",
    ])).toEqual(["NPU", "Verifier", "Kernel"]);
    expect(tagTone(" NPU ")).toBe(0);
    expect(tagTone("NPU")).toBe(tagTone("npu"));
    expect(tagTone("Verifier")).toBe(3);
  });

  it("maps Module storage rows to user-defined Types", () => {
    expect(taskTypeFromStorage({
      id: "type-1",
      name: "Kernel",
      kind: "foundation",
      objective: "Kernel work",
      position: 2,
      created_at: "2026-07-27T00:00:00Z",
    })).toEqual({
      id: "type-1",
      name: "Kernel",
      description: "Kernel work",
      position: 2,
      created_at: "2026-07-27T00:00:00Z",
    });
  });

  it("maps Type patches without exposing storage terminology", () => {
    expect(taskTypePatchToStorage({})).toEqual({});
    expect(taskTypePatchToStorage({
      name: "",
      description: "",
      position: 0,
    })).toEqual({
      name: "",
      objective: "",
      position: 0,
    });
  });

  it("creates storage payloads with optional Type and normalized Tags", () => {
    expect(newTaskToStorage({
      title: "  Validate kernels  ",
      status: "todo",
      typeId: null,
      tags: [" NPU ", "npu"],
      owners: [],
      priority: "medium",
      dueDate: null,
      description: "  Check every case.  ",
    }, -1)).toEqual({
      module_id: null,
      title: "Validate kernels",
      status: "todo",
      assignees: [],
      notes: "Check every case.",
      tags: ["NPU"],
      priority: "medium",
      due_date: null,
      position: -1,
    });
  });
});
