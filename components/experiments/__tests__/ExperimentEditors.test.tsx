import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CommaListInput from "@/components/experiments/CommaListInput";
import ConfigEditor from "@/components/experiments/ConfigEditor";
import DataEditor from "@/components/experiments/DataEditor";
import EnvironmentEditor from "@/components/experiments/EnvironmentEditor";
import ObjectEditor from "@/components/experiments/ObjectEditor";

describe("structured experiment editors", () => {
  afterEach(cleanup);

  it("adds a typed evaluation Dataset", () => {
    const onChange = vi.fn();
    render(<DataEditor value={{ datasets: [] }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Add dataset" }));

    expect(onChange).toHaveBeenCalledWith({
      datasets: [{
        role: "evaluation",
        name: "",
        split: "",
        revision: "",
        task_count: null,
        samples_per_task: null,
      }],
    });
  });

  it("updates one dataset without changing its siblings", () => {
    const onChange = vi.fn();
    render(
      <DataEditor
        value={{
          datasets: [
            {
              role: "training",
              name: "train-a",
              split: "train",
              revision: "a1",
              task_count: 12,
              samples_per_task: 4,
            },
            {
              role: "evaluation",
              name: "eval-b",
              split: "test",
              revision: "b2",
              task_count: null,
              samples_per_task: null,
            },
          ],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Dataset 2 task count"), {
      target: { value: "7" },
    });

    expect(onChange).toHaveBeenCalledWith({
      datasets: [
        {
          role: "training",
          name: "train-a",
          split: "train",
          revision: "a1",
          task_count: 12,
          samples_per_task: 4,
        },
        {
          role: "evaluation",
          name: "eval-b",
          split: "test",
          revision: "b2",
          task_count: 7,
          samples_per_task: null,
        },
      ],
    });
  });

  it("removes a dataset before updating the shifted row without corrupting siblings", () => {
    const onChange = vi.fn();
    const value = {
      datasets: [
        { role: "training" as const, name: "first", split: "train", revision: "r1", task_count: 1, samples_per_task: 1 },
        { role: "evaluation" as const, name: "second", split: "test", revision: "r2", task_count: 2, samples_per_task: 2 },
        { role: "evaluation" as const, name: "third", split: "test", revision: "r3", task_count: 3, samples_per_task: 3 },
      ],
    };
    const { rerender } = render(<DataEditor value={value} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove dataset" })[0]);
    const removed = onChange.mock.lastCall![0];
    rerender(<DataEditor value={removed} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Dataset 1 name"), { target: { value: "second-updated" } });

    expect(onChange).toHaveBeenLastCalledWith({
      datasets: [
        { role: "evaluation", name: "second-updated", split: "test", revision: "r2", task_count: 2, samples_per_task: 2 },
        { role: "evaluation", name: "third", split: "test", revision: "r3", task_count: 3, samples_per_task: 3 },
      ],
    });
  });

  it("edits Model while retaining Harness fields", () => {
    const onChange = vi.fn();
    render(
      <ObjectEditor
        value={{
          model: "",
          harness: "cand_0000",
          parent_harness: "seed",
          prompt: "prompt.md",
          prompt_change: "",
          skills: [],
          tools: [],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "Qwen3.6" } });

    expect(onChange).toHaveBeenCalledWith({
      model: "Qwen3.6",
      harness: "cand_0000",
      parent_harness: "seed",
      prompt: "prompt.md",
      prompt_change: "",
      skills: [],
      tools: [],
    });
  });

  it("normalizes a comma list only after the user finishes editing", () => {
    const onChange = vi.fn();
    render(<CommaListInput label="Skills" value={[]} onChange={onChange} />);
    const input = screen.getByLabelText("Skills");

    fireEvent.change(input, { target: { value: "draft," } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(["draft"]);
  });

  it("edits every required environment field", () => {
    const onChange = vi.fn();
    const value = {
      platform: "npu" as const,
      server: "ascend-01",
      devices: ["0", "1"],
      hardware: "Ascend 910B",
      evaluator: "kernelbench",
      revision: "r1",
      precision_policy: "fp32",
    };
    render(<EnvironmentEditor value={value} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "gpu" } });
    fireEvent.change(screen.getByLabelText("Server"), { target: { value: "gpu-01" } });
    fireEvent.change(screen.getByLabelText("Devices"), { target: { value: "2, 3" } });
    fireEvent.blur(screen.getByLabelText("Devices"));
    fireEvent.change(screen.getByLabelText("Hardware"), { target: { value: "H100" } });
    fireEvent.change(screen.getByLabelText("Evaluator or Grader"), { target: { value: "new-grader" } });
    fireEvent.change(screen.getByLabelText("Environment Revision"), { target: { value: "r2" } });
    fireEvent.change(screen.getByLabelText("Precision policy"), { target: { value: "bf16" } });

    expect(onChange).toHaveBeenNthCalledWith(1, { ...value, platform: "gpu" });
    expect(onChange).toHaveBeenNthCalledWith(2, { ...value, server: "gpu-01" });
    expect(onChange).toHaveBeenNthCalledWith(3, { ...value, devices: ["2", "3"] });
    expect(onChange).toHaveBeenNthCalledWith(4, { ...value, hardware: "H100" });
    expect(onChange).toHaveBeenNthCalledWith(5, { ...value, evaluator: "new-grader" });
    expect(onChange).toHaveBeenNthCalledWith(6, { ...value, revision: "r2" });
    expect(onChange).toHaveBeenNthCalledWith(7, { ...value, precision_policy: "bf16" });
  });

  it("preserves numeric Config values as numbers", () => {
    const onChange = vi.fn();
    render(<ConfigEditor value={{ temperature: 0.1 }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("temperature value"), { target: { value: "0.2" } });

    expect(onChange).toHaveBeenCalledWith({ temperature: 0.2 });
  });

  it("allows arbitrary own Config keys when renaming", () => {
    const onChange = vi.fn();
    render(<ConfigEditor value={{ temperature: 0.1 }} onChange={onChange} />);

    const key = screen.getByLabelText("temperature key");
    fireEvent.change(key, { target: { value: "constructor" } });
    fireEvent.blur(key);

    expect(onChange).toHaveBeenCalledWith({ constructor: 0.1 });
  });

  it("renames to __proto__ as an own Config key without changing the prototype", () => {
    const onChange = vi.fn();
    render(
      <ConfigEditor
        value={Object.fromEntries([["temperature", 0.1], ["sibling", "keep"]])}
        onChange={onChange}
      />,
    );

    const key = screen.getByLabelText("temperature key");
    fireEvent.change(key, { target: { value: "__proto__" } });
    fireEvent.blur(key);

    const result = onChange.mock.lastCall![0];
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(result["__proto__"]).toBe(0.1);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result.sibling).toBe("keep");
  });

  it("resets an empty Config key draft after blur", () => {
    const onChange = vi.fn();
    render(<ConfigEditor value={{ temperature: 0.1 }} onChange={onChange} />);

    const key = screen.getByLabelText("temperature key") as HTMLInputElement;
    fireEvent.change(key, { target: { value: "" } });
    fireEvent.blur(key);

    expect(onChange).not.toHaveBeenCalled();
    expect(key.value).toBe("temperature");
  });

  it("keeps the persisted Config key visible after an unchanged blur", () => {
    const onChange = vi.fn();
    render(<ConfigEditor value={{ temperature: 0.1 }} onChange={onChange} />);

    const key = screen.getByLabelText("temperature key") as HTMLInputElement;
    fireEvent.blur(key);

    expect(onChange).not.toHaveBeenCalled();
    expect(key.value).toBe("temperature");
  });

  it("resets a colliding Config key draft after blur", () => {
    const onChange = vi.fn();
    render(<ConfigEditor value={{ temperature: 0.1, top_p: 0.9 }} onChange={onChange} />);

    const key = screen.getByLabelText("temperature key") as HTMLInputElement;
    fireEvent.change(key, { target: { value: "top_p" } });
    fireEvent.blur(key);

    expect(onChange).not.toHaveBeenCalled();
    expect(key.value).toBe("temperature");
  });

  it("synchronizes a successful Config key rename after the parent rerenders", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ConfigEditor value={{ temperature: 0.1 }} onChange={onChange} />);

    const key = screen.getByLabelText("temperature key");
    fireEvent.change(key, { target: { value: "top_p" } });
    fireEvent.blur(key);
    rerender(<ConfigEditor value={{ top_p: 0.1 }} onChange={onChange} />);

    expect((screen.getByLabelText("top_p key") as HTMLInputElement).value).toBe("top_p");
  });

  it("keeps sibling ordering when renaming a Config key", () => {
    const onChange = vi.fn();
    render(<ConfigEditor value={{ first: "a", middle: "b", last: "c" }} onChange={onChange} />);

    const key = screen.getByLabelText("middle key");
    fireEvent.change(key, { target: { value: "renamed" } });
    fireEvent.blur(key);

    const result = onChange.mock.lastCall![0];
    expect(Object.keys(result)).toEqual(["first", "renamed", "last"]);
    expect(result).toEqual({ first: "a", renamed: "b", last: "c" });
  });

  it("adds a collision-safe Config parameter and deletes a parameter", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ConfigEditor value={{ parameter_3: "taken", other: "keep", remove_me: true }} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    expect(onChange).toHaveBeenLastCalledWith({
      parameter_3: "taken",
      other: "keep",
      remove_me: true,
      parameter_4: "",
    });

    rerender(<ConfigEditor value={{ parameter_3: "taken", other: "keep", remove_me: true }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove remove_me" }));
    expect(onChange).toHaveBeenLastCalledWith({ parameter_3: "taken", other: "keep" });
  });

  it("transitions Config values between string, number, boolean, and null", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ConfigEditor value={{ mode: "draft" }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("mode type"), { target: { value: "number" } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: 0 });
    rerender(<ConfigEditor value={{ mode: 0 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("mode type"), { target: { value: "boolean" } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: false });
    rerender(<ConfigEditor value={{ mode: false }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("mode type"), { target: { value: "null" } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: null });
    rerender(<ConfigEditor value={{ mode: null }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("mode type"), { target: { value: "string" } });
    expect(onChange).toHaveBeenLastCalledWith({ mode: "" });
  });

  it("keeps valid unknown Config keys when editing another parameter", () => {
    const onChange = vi.fn();
    render(
      <ConfigEditor
        value={{ temperature: 0.1, custom_flag: true, profile: null }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("temperature value"), { target: { value: "0.2" } });

    expect(onChange).toHaveBeenCalledWith({ temperature: 0.2, custom_flag: true, profile: null });
  });
});
