import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const globals = readFileSync(resolve(root, "app/globals.css"), "utf8");
const layout = readFileSync(resolve(root, "app/layout.tsx"), "utf8");
const appShell = readFileSync(
  resolve(root, "components/shell/AppShell.tsx"),
  "utf8",
);
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

function mediaBody(css: string, width: number): string {
  const match = css.match(
    new RegExp(`@media\\s*\\(max-width:\\s*${width}px\\)\\s*\\{([\\s\\S]+)\\}\\s*$`),
  );
  expect(match, `Expected a max-width ${width}px media query`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("workspace visual contracts", () => {
  it("mounts the global workspace shell through the root layout", () => {
    expect(layout).toMatch(/import\s+["']\.\/experiment-workspace\.css["']/);
    expect(layout).toMatch(/<AppShell/);
    expect(appShell).toMatch(/className=["']app-shell["']/);
    expect(appShell).toMatch(
      /<main\s+className=["']app-content["']>\{children\}<\/main>/,
    );
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
    const mobile = mediaBody(globals, 860);
    expect(mobile).toMatch(/\.app-shell\s*\{\s*display\s*:\s*block/);
    expect(mobile).toMatch(/\.navbar-inner[\s\S]*flex-direction\s*:\s*row/);
    expect(mobile).toMatch(/overflow-x\s*:\s*auto/);
  });

  it("stacks legacy board and analytics layouts before the sidebar leaves them 820px", () => {
    expect(globals).not.toMatch(/@media\s*\(max-width:\s*820px\)/);
    const sidebarAware = mediaBody(globals, 1052);
    expect(sidebarAware).toMatch(/\.pipeline\s*\{\s*flex-direction\s*:\s*column/);
    expect(sidebarAware).toMatch(
      /\.foundation-grid\s*\{\s*grid-template-columns\s*:\s*1fr/,
    );
    expect(sidebarAware).toMatch(/\.panel-grid\s*\{\s*grid-template-columns\s*:\s*1fr/);
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
    const mobile = mediaBody(css, 760);
    expect(mobile).toMatch(
      /\.dataset-row\s*,\s*\.property-grid\s*\{\s*grid-template-columns\s*:\s*1fr/,
    );
    expect(mobile).toMatch(
      /\.decision-editor\s*\{\s*grid-template-columns\s*:\s*1fr/,
    );
    expect(ruleBody(css, ".experiment-save-bar")).toMatch(/flex-wrap\s*:\s*wrap/);
    expect(mobile).toMatch(/\.workspace-actions[\s\S]*width\s*:\s*100%/);
  });

  it("stacks the Task experiments header and actions on mobile", () => {
    const mobile = mediaBody(workspaceCss(), 760);
    const header = ruleBody(
      mobile,
      ".task-experiments-section .detail-section-head",
    );
    expect(header).toMatch(/flex-direction\s*:\s*column/);
    expect(header).toMatch(/align-items\s*:\s*stretch/);
    expect(ruleBody(mobile, ".task-experiments-section .workspace-actions"))
      .toMatch(/width\s*:\s*100%/);
  });

  it("wraps long Baseline and context values instead of widening mobile pages", () => {
    const mobile = mediaBody(workspaceCss(), 760);
    const baseline = ruleBody(mobile, ".baseline-reference");
    expect(baseline).toMatch(/white-space\s*:\s*normal/);
    expect(baseline).toMatch(/overflow-wrap\s*:\s*anywhere/);
    expect(ruleBody(mobile, ".context-difference-list > div"))
      .toMatch(/grid-template-columns\s*:\s*1fr/);
    const contextValue = ruleBody(mobile, ".context-difference-list > div > *");
    expect(contextValue).toMatch(/min-width\s*:\s*0/);
    expect(contextValue).toMatch(/overflow-wrap\s*:\s*anywhere/);
  });

  it("styles the real Baseline search input and keeps its focus visible", () => {
    const css = workspaceCss();
    expect(css).toMatch(
      /\.baseline-picker input\s*,[\s\S]*?\.baseline-picker select\s*,/,
    );
    expect(css).toMatch(
      /\.baseline-picker input:focus-visible\s*,[\s\S]*?\.baseline-picker select:focus-visible\s*,/,
    );
  });

  it("reserves mobile authenticated header space without changing login/setup shells", () => {
    const mobile = mediaBody(globals, 860);
    expect(ruleBody(mobile, ".login-screen")).toMatch(
      /min-height\s*:\s*calc\(100dvh\s*-\s*52px\)/,
    );
    expect(ruleBody(mobile, ".app-content:has(> .logout-btn)"))
      .toMatch(/padding-top\s*:/);
    const logout = ruleBody(mobile, ".app-content > .logout-btn");
    expect(logout).toMatch(/position\s*:\s*absolute/);
    expect(logout).not.toMatch(/position\s*:\s*fixed/);
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
