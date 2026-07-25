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

  it("edits every environment field while retaining the existing device list", () => {
    const onChange = vi.fn();
    render(
      <EnvironmentEditor
        value={{
          platform: "npu",
          server: "ascend-01",
          devices: ["0", "1"],
          hardware: "Ascend 910B",
          evaluator: "kernelbench",
          revision: "r1",
          precision_policy: "fp32",
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Environment Revision"), {
      target: { value: "r2" },
    });

    expect(onChange).toHaveBeenCalledWith({
      platform: "npu",
      server: "ascend-01",
      devices: ["0", "1"],
      hardware: "Ascend 910B",
      evaluator: "kernelbench",
      revision: "r2",
      precision_policy: "fp32",
    });
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
