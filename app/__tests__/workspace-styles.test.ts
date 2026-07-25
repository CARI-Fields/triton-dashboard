import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const globals = readFileSync(resolve(root, "app/globals.css"), "utf8");
const layout = readFileSync(resolve(root, "app/layout.tsx"), "utf8");
const workspacePath = resolve(root, "app/experiment-workspace.css");

function workspaceCss(): string {
  return readFileSync(workspacePath, "utf8");
}

function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  expect(match, `Expected a CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("workspace visual contracts", () => {
  it("mounts the global workspace shell through the root layout", () => {
    expect(layout).toMatch(/import\s+["']\.\/experiment-workspace\.css["']/);
    expect(layout).toMatch(/className=["']app-shell["']/);
    expect(layout).toMatch(/<Navbar\s*\/>/);
    expect(layout).toMatch(/<main\s+className=["']app-content["']>\{children\}<\/main>/);
  });

  it("uses a white canvas and a 232px warm-gray desktop sidebar without decoration", () => {
    expect(globals).not.toMatch(/background-image\s*:\s*radial-gradient/i);
    expect(ruleBody(globals, ".app-shell")).toMatch(
      /grid-template-columns\s*:\s*232px\s+minmax\(0,\s*1fr\)/,
    );
    expect(ruleBody(globals, ".app-content")).toMatch(/background\s*:\s*var\(--paper\)/);
    expect(ruleBody(globals, ".navbar")).toMatch(/background\s*:\s*#f7f6f3/i);
    expect(ruleBody(globals, ".navbar")).toMatch(/border-right\s*:/);
  });

  it("switches the shell to horizontal navigation at 860px", () => {
    const mobile = globals.match(/@media\s*\(max-width:\s*860px\)\s*\{([\s\S]+)\}\s*$/);
    expect(mobile).not.toBeNull();
    expect(mobile?.[1]).toMatch(/\.app-shell\s*\{\s*display\s*:\s*block/);
    expect(mobile?.[1]).toMatch(/\.navbar-inner[\s\S]*flex-direction\s*:\s*row/);
    expect(mobile?.[1]).toMatch(/overflow-x\s*:\s*auto/);
  });

  it("keeps experiment and compare tables scrollable and pins Compare identity", () => {
    const css = workspaceCss();
    expect(css).toMatch(
      /\.experiment-table-scroll\s*,\s*\.compare-table-scroll\s*\{[\s\S]*?overflow\s*:\s*auto/,
    );
    const identity = ruleBody(css, ".compare-table .compare-identity");
    expect(identity).toMatch(/position\s*:\s*sticky/);
    expect(identity).toMatch(/left\s*:\s*0/);
  });

  it("keeps Delta visually neutral", () => {
    const delta = ruleBody(workspaceCss(), ".neutral-delta");
    expect(delta).toMatch(/color\s*:\s*(#5f5e5b|var\(--ink-soft\))/i);
    expect(delta).not.toMatch(/good|crit|success|danger/i);
  });

  it("stacks editor forms and lets narrow save actions wrap", () => {
    const css = workspaceCss();
    const mobile = css.match(/@media\s*\(max-width:\s*760px\)\s*\{([\s\S]+)\}\s*$/);
    expect(mobile).not.toBeNull();
    expect(mobile?.[1]).toMatch(
      /\.dataset-row\s*,\s*\.property-grid\s*\{\s*grid-template-columns\s*:\s*1fr/,
    );
    expect(mobile?.[1]).toMatch(
      /\.decision-editor\s*\{\s*grid-template-columns\s*:\s*1fr/,
    );
    expect(ruleBody(css, ".experiment-save-bar")).toMatch(/flex-wrap\s*:\s*wrap/);
    expect(mobile?.[1]).toMatch(/\.workspace-actions[\s\S]*width\s*:\s*100%/);
  });

  it("defines explicit focus-visible treatment for every interactive workspace family", () => {
    const css = `${globals}\n${workspaceCss()}`;
    const focusFamilies = [
      ".brand:focus-visible",
      ".nav-btn:focus-visible",
      ".btn:focus-visible",
      ".icon-btn:focus-visible",
      ".saved-view-tabs button:focus-visible",
      "input[type=\"checkbox\"]:focus-visible",
      ".experiment-title-input:focus-visible",
      ".remove-compare:focus-visible",
      ".experiment-image-grid figcaption input:focus-visible",
    ];
    for (const selector of focusFamilies) {
      expect(css, `Missing explicit keyboard focus for ${selector}`).toContain(selector);
    }
  });
});
