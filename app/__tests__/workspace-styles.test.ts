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

function mediaBody(css: string, width: number): string {
  const match = css.match(
    new RegExp(`@media\\s*\\(max-width:\\s*${width}px\\)\\s*\\{([\\s\\S]+)\\}\\s*$`),
  );
  expect(match, `Expected a max-width ${width}px media query`).not.toBeNull();
  return match?.[1] ?? "";
}

type Rgb = [number, number, number];

function hexColor(body: string, property: string): Rgb {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(
    new RegExp(`${escaped}\\s*:\\s*#([0-9a-f]{6})`, "i"),
  );
  expect(match, `Expected a six-digit color for ${property}`).not.toBeNull();
  const hex = match?.[1] ?? "000000";
  return [0, 2, 4].map((index) => (
    Number.parseInt(hex.slice(index, index + 2), 16)
  )) as Rgb;
}

function mixColors(foreground: Rgb, background: Rgb, weight: number): Rgb {
  return foreground.map((channel, index) => (
    channel * weight + background[index] * (1 - weight)
  )) as Rgb;
}

function relativeLuminance(color: Rgb): number {
  const [red, green, blue] = color.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045
      ? srgb / 12.92
      : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: Rgb, second: Rgb): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("workspace visual contracts", () => {
  it("mounts the global workspace shell through the root layout", () => {
    const globalsImport = layout.indexOf('import "./globals.css"');
    const workspaceImport = layout.indexOf('import "./experiment-workspace.css"');
    expect(globalsImport).toBeGreaterThan(-1);
    expect(workspaceImport).toBeGreaterThan(globalsImport);
    expect(layout).not.toMatch(/^["']use client["'];?/m);
    expect(layout).toMatch(/import\s+Script\s+from\s+["']next\/script["']/);
    expect(layout).toMatch(/<html[^>]*suppressHydrationWarning/);
    expect(layout).toMatch(
      /<Script\s+id=["']theme-init["']\s+strategy=["']beforeInteractive["']>/,
    );
    expect(layout).toContain('localStorage.getItem("triton-theme")');
    expect(layout).toMatch(/<ThemeProvider>[\s\S]*<AuthGate>/);
    expect(layout).toMatch(/<AuthGate>[\s\S]*className=["']app-shell["']/);
    expect(layout).toMatch(/className=["']app-shell["']/);
    expect(layout).toMatch(/<Navbar\s*\/>/);
    expect(layout).toMatch(/<main\s+className=["']app-content["']>\{children\}<\/main>/);
  });

  it("defines the approved light and dark semantic color contracts", () => {
    expect(globals).toContain("--canvas: #ffffff");
    expect(globals).toContain("--surface: #ffffff");
    expect(globals).toContain("--surface-subtle: #f8faff");
    expect(globals).toContain("--accent: #1e96eb");
    expect(globals).toMatch(/\[data-theme="dark"\][\s\S]*--canvas:\s*#141414/);
    expect(globals).toMatch(/\[data-theme="dark"\][\s\S]*--surface:\s*#252525/);
    expect(globals).toMatch(/\[data-theme="dark"\][\s\S]*--border:\s*#414141/);
    expect(globals).toMatch(/\[data-theme="dark"\][\s\S]*--text-primary:\s*#e6e6e6/i);
    expect(globals).not.toMatch(/gradient\s*\(/i);
  });

  it("uses theme-specific semantic foregrounds and status colors for every pill", () => {
    const lightTokens = ruleBody(globals, ":root");
    const darkTokens = ruleBody(globals, '[data-theme="dark"]');
    const statuses = [
      { token: "todo", className: "todo" },
      { token: "progress", className: "in_progress" },
      { token: "done", className: "done" },
      { token: "blocked", className: "blocked" },
    ] as const;

    for (const { token, className } of statuses) {
      expect(lightTokens).toMatch(
        new RegExp(`--status-${token}-foreground\\s*:`),
      );
      expect(darkTokens).toMatch(
        new RegExp(`--status-${token}-foreground\\s*:`),
      );
      expect(ruleBody(globals, `.dot.${className}`)).toMatch(
        new RegExp(`background\\s*:\\s*var\\(--status-${token}\\)`),
      );

      const pill = ruleBody(globals, `.pill.${className}`);
      expect(pill).toMatch(
        new RegExp(`background\\s*:\\s*var\\(--status-${token}-soft\\)`),
      );
      expect(pill).toMatch(
        new RegExp(`color\\s*:\\s*var\\(--status-${token}-foreground\\)`),
      );
      expect(pill).not.toMatch(/#[0-9a-f]{3,8}/i);
    }

    expect(ruleBody(globals, ".dot.in_progress")).not.toContain("--warn");
    expect(ruleBody(globals, ".pill.in_progress")).not.toContain("--warn");
  });

  it("uses the approved 256px desktop shell and semantic sidebar surface", () => {
    expect(ruleBody(globals, ".app-shell")).toMatch(
      /grid-template-columns\s*:\s*256px\s+minmax\(0,\s*1fr\)/,
    );
    expect(ruleBody(globals, ".app-shell")).toMatch(/background\s*:\s*var\(--canvas\)/);
    expect(ruleBody(globals, ".app-sidebar")).toMatch(
      /background\s*:\s*var\(--surface-subtle\)/,
    );
    expect(ruleBody(globals, ".app-sidebar")).toMatch(/border-right\s*:/);
  });

  it("keeps Drawer content in one scrollable body row with a stable footer row", () => {
    const panel = ruleBody(globals, ".drawer-panel");
    expect(panel).toMatch(
      /grid-template-rows\s*:\s*minmax\(0,\s*1fr\)\s+auto/,
    );
    expect(panel).toMatch(/overflow\s*:\s*hidden/);

    const body = ruleBody(globals, ".drawer-body");
    expect(body).toMatch(/grid-row\s*:\s*1/);
    expect(body).toMatch(/min-height\s*:\s*0/);
    expect(body).toMatch(/overflow-y\s*:\s*auto/);

    expect(ruleBody(globals, ".drawer-footer")).toMatch(/grid-row\s*:\s*2/);
  });

  it("keeps Tag remove icons subdued and at least 3:1 across tones and themes", () => {
    const tag = ruleBody(globals, ".tag");
    expect(tag).toMatch(
      /background\s*:\s*color-mix\(in srgb,\s*var\(--tag-accent\)\s+12%,\s*var\(--surface\)\)/,
    );

    const remove = ruleBody(globals, ".tag-remove");
    expect(remove).toMatch(/color\s*:\s*var\(--text-secondary\)/);
    expect(remove).not.toMatch(/color\s*:\s*var\(--tag-accent\)/);

    const themes = [
      { name: "light", tokens: ruleBody(globals, ":root") },
      { name: "dark", tokens: ruleBody(globals, '[data-theme="dark"]') },
    ];
    for (const { name, tokens } of themes) {
      const surface = hexColor(tokens, "--surface");
      const foreground = hexColor(tokens, "--text-secondary");

      for (let tone = 0; tone < 6; tone += 1) {
        const accent = hexColor(
          ruleBody(globals, `.tag[data-tone="${tone}"]`),
          "--tag-accent",
        );
        const tagBackground = mixColors(accent, surface, 0.12);
        const hoverBackground = mixColors(accent, tagBackground, 0.12);

        expect(
          contrastRatio(foreground, tagBackground),
          `${name} tone ${tone} default contrast`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrastRatio(foreground, hoverBackground),
          `${name} tone ${tone} hover contrast`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("switches the shell to an accessible navigation sheet at 768px", () => {
    const mobile = mediaBody(globals, 768);
    expect(mobile).toMatch(/\.app-shell\s*\{\s*display\s*:\s*block/);
    expect(ruleBody(mobile, ".mobile-app-bar")).toMatch(/display\s*:\s*flex/);
    expect(ruleBody(mobile, ".app-sidebar")).toMatch(/position\s*:\s*fixed/);
    expect(ruleBody(mobile, ".app-sidebar")).toMatch(
      /transform\s*:\s*translateX\(-100%\)/,
    );
    expect(ruleBody(mobile, ".app-sidebar")).toMatch(/visibility\s*:\s*hidden/);
    expect(ruleBody(mobile, ".app-sidebar")).toMatch(
      /pointer-events\s*:\s*none/,
    );
    expect(ruleBody(mobile, ".app-sidebar.is-open")).toMatch(
      /transform\s*:\s*translateX\(0\)/,
    );
    expect(ruleBody(mobile, ".app-sidebar.is-open")).toMatch(
      /visibility\s*:\s*visible/,
    );
    expect(ruleBody(mobile, ".app-sidebar.is-open")).toMatch(
      /pointer-events\s*:\s*auto/,
    );
    expect(ruleBody(mobile, ".nav-backdrop")).toMatch(/display\s*:\s*block/);
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
