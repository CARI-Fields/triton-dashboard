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
  it("anchors the owner picker and ellipsizes selected chip names", () => {
    const picker = ruleBody(globals, ".owner-picker");
    expect(picker).toMatch(/position\s*:\s*relative/);
    expect(picker).toMatch(/min-width\s*:\s*0/);
    const panel = ruleBody(globals, ".owner-picker-panel");
    expect(panel).toMatch(/position\s*:\s*absolute/);
    expect(panel).toMatch(/top\s*:\s*calc\(100%\s*\+\s*6px\)/);
    expect(panel).toMatch(/left\s*:\s*0/);

    const name = ruleBody(globals, ".selected-owner-name");
    expect(name).toMatch(/min-width\s*:\s*0/);
    expect(name).toMatch(/overflow\s*:\s*hidden/);
    expect(name).toMatch(/text-overflow\s*:\s*ellipsis/);
    expect(name).toMatch(/white-space\s*:\s*nowrap/);
    expect(globals).not.toMatch(/\.owner-options\s*\{/);
  });

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

  it("keeps dark tables, inputs, cards, and drawers on semantic surfaces", () => {
    const darkTokens = ruleBody(globals, '[data-theme="dark"]');
    expect(darkTokens).toMatch(/color-scheme\s*:\s*dark/);

    for (const { css, selector } of [
      { css: workspaceCss(), selector: ".experiment-table-scroll" },
      {
        css: workspaceCss(),
        selector: ".database-toolbar input,\n.database-toolbar select",
      },
      { css: globals, selector: ".task-card" },
      { css: globals, selector: ".drawer-panel" },
      { css: workspaceCss(), selector: ".experiment-dialog" },
    ]) {
      const body = ruleBody(css, selector);
      expect(body, selector).toMatch(
        /(?:background|background-color)\s*:\s*var\(--surface(?:-subtle)?\)/,
      );
      expect(body, selector).not.toMatch(
        /(?:background|background-color)\s*:\s*#(?:fff(?:fff)?|000(?:000)?)/i,
      );
    }

    const input = ruleBody(
      workspaceCss(),
      ".database-toolbar input,\n.database-toolbar select",
    );
    expect(input).toMatch(/color\s*:\s*var\(--text-primary\)/);
    expect(input).toMatch(/border\s*:\s*1px\s+solid\s+var\(--border-strong\)/);
    expect(ruleBody(globals, ".drawer-panel")).toMatch(
      /border-left\s*:\s*1px\s+solid\s+var\(--border\)/,
    );
    expect(ruleBody(workspaceCss(), ".experiment-dialog")).toMatch(
      /border\s*:\s*1px\s+solid\s+var\(--border-strong\)/,
    );
    expect(ruleBody(globals, ".task-card")).toMatch(
      /border\s*:\s*1px\s+solid\s+var\(--border\)/,
    );
  });

  it("keeps focus, disabled states, and reduced motion readable", () => {
    expect(globals).toMatch(
      /\.brand:focus-visible,[\s\S]+?box-shadow\s*:\s*var\(--focus-ring\)/,
    );

    const disabled = ruleBody(workspaceCss(), ".btn.disabled, .btn:disabled");
    expect(disabled).toMatch(/background\s*:\s*var\(--surface-subtle\)/);
    expect(disabled).toMatch(/color\s*:\s*var\(--text-secondary\)/);
    expect(disabled).toMatch(/border-color\s*:\s*var\(--border\)/);
    expect(disabled).not.toMatch(/opacity\s*:\s*(?:0|\\.)/);

    const reduced = globals.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]+?)\n\}/,
    )?.[1] ?? "";
    expect(reduced).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after/);
    expect(reduced).toMatch(/scroll-behavior\s*:\s*auto\s*!important/);
    expect(reduced).toMatch(/animation-duration\s*:\s*0\.01ms\s*!important/);
    expect(reduced).toMatch(/transition-duration\s*:\s*0\.01ms\s*!important/);
  });

  it("uses an AA accent foreground for Experiment Record active text", () => {
    const lightTokens = ruleBody(globals, ":root");
    const darkTokens = ruleBody(globals, '[data-theme="dark"]');
    expect(lightTokens).toMatch(/--accent-foreground\s*:\s*#075f9f/i);
    expect(darkTokens).toMatch(/--accent-foreground\s*:\s*#8dcef7/i);

    for (const { name, tokens } of [
      { name: "light", tokens: lightTokens },
      { name: "dark", tokens: darkTokens },
    ]) {
      expect(
        contrastRatio(
          hexColor(tokens, "--accent-foreground"),
          hexColor(tokens, "--canvas"),
        ),
        `${name} accent foreground contrast`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    const css = workspaceCss();
    for (const selector of [
      ".section-anchors a:focus-visible",
      '.section-anchors:has(~ #note:target) a[href="#note"]',
      ".experiment-section:target .experiment-section-heading h2",
      ".attachment-preview:hover",
    ]) {
      expect(ruleBody(css, selector), selector).toMatch(
        /color\s*:\s*var\(--accent-foreground\)/,
      );
    }
    expect(ruleBody(css, ".section-anchors a:focus-visible")).toMatch(
      /border-bottom-color\s*:\s*var\(--accent\)/,
    );
    expect(ruleBody(
      css,
      '.section-anchors:has(~ #note:target) a[href="#note"]',
    )).toMatch(/border-bottom-color\s*:\s*var\(--accent\)/);
  });

  it("uses an AA semantic foreground on primary accent buttons in both themes", () => {
    const lightTokens = ruleBody(globals, ":root");
    const darkTokens = ruleBody(globals, '[data-theme="dark"]');

    for (const { name, tokens } of [
      { name: "light", tokens: lightTokens },
      { name: "dark", tokens: darkTokens },
    ]) {
      const foreground = hexColor(tokens, "--on-accent");
      for (const property of ["--accent", "--accent-hover"]) {
        expect(
          contrastRatio(foreground, hexColor(tokens, property)),
          `${name} ${property} button contrast`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }

    expect(ruleBody(globals, ".btn.primary")).toMatch(
      /color\s*:\s*var\(--on-accent\)/,
    );
    expect(ruleBody(globals, ".btn.primary:hover")).toMatch(
      /color\s*:\s*var\(--on-accent\)/,
    );
  });

  it("keeps workspace metadata on AA semantic text instead of a raw gray", () => {
    const css = workspaceCss();
    expect(css).not.toMatch(/#787774/i);

    for (const { name, tokens } of [
      { name: "light", tokens: ruleBody(globals, ":root") },
      { name: "dark", tokens: ruleBody(globals, '[data-theme="dark"]') },
    ]) {
      const foreground = hexColor(tokens, "--text-secondary");
      for (const property of ["--canvas", "--surface"]) {
        expect(
          contrastRatio(foreground, hexColor(tokens, property)),
          `${name} metadata contrast on ${property}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("preserves the global accent focus ring through workspace field overrides", () => {
    const fieldFocusRules = Array.from(
      workspaceCss().matchAll(/([^{}]+)\{([^{}]*)\}/g),
    ).filter(([, selector, body]) => (
      selector.includes(":focus-visible")
      && /(?:input|select|textarea)/.test(selector)
      && /box-shadow\s*:/.test(body)
      && !selector.includes(".featured-toggle input")
      && !selector.includes(".experiment-select-control input")
    ));

    expect(fieldFocusRules.length).toBeGreaterThanOrEqual(9);
    for (const [, selector, body] of fieldFocusRules) {
      expect(body, selector.trim()).toMatch(
        /box-shadow\s*:\s*var\(--focus-ring\)/,
      );
    }
  });

  it("uses an AA semantic foreground for Analytics attention metadata", () => {
    const lightTokens = ruleBody(globals, ":root");
    const darkTokens = ruleBody(globals, '[data-theme="dark"]');

    for (const { name, tokens } of [
      { name: "light", tokens: lightTokens },
      { name: "dark", tokens: darkTokens },
    ]) {
      expect(
        contrastRatio(
          hexColor(tokens, "--text-secondary"),
          hexColor(tokens, "--surface"),
        ),
        `${name} Analytics attention metadata contrast`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    expect(ruleBody(globals, ".attention-list span")).toMatch(
      /color\s*:\s*var\(--text-secondary\)/,
    );
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

  it("keeps banner and create-form errors semantic and at least 4.5:1 in both themes", () => {
    const errorBanner = ruleBody(globals, ".error-banner");
    const formError = ruleBody(workspaceCss(), ".form-error");
    expect(errorBanner).toMatch(
      /background\s*:\s*var\(--status-blocked-soft\)/,
    );
    expect(errorBanner).toMatch(
      /color\s*:\s*var\(--status-blocked-foreground\)/,
    );
    expect(errorBanner).toMatch(
      /border\s*:\s*1px\s+solid\s+color-mix\(in srgb,\s*var\(--status-blocked\)\s+\d+%,\s*var\(--border\)\)/,
    );
    expect(formError).toMatch(
      /color\s*:\s*var\(--status-blocked-foreground\)/,
    );

    const lightTokens = ruleBody(globals, ":root");
    const blocked = hexColor(lightTokens, "--status-blocked");
    const themes = [
      { name: "light", tokens: lightTokens },
      { name: "dark", tokens: ruleBody(globals, '[data-theme="dark"]') },
    ];
    for (const { name, tokens } of themes) {
      const surface = hexColor(tokens, "--surface");
      const foreground = hexColor(tokens, "--status-blocked-foreground");
      const bannerBackground = mixColors(blocked, surface, 0.12);
      expect(
        contrastRatio(foreground, bannerBackground),
        `${name} error banner contrast`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(foreground, surface),
        `${name} create form error contrast`,
      ).toBeGreaterThanOrEqual(4.5);
    }
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

  it("styles structural loading placeholders with semantic, motion-safe shapes", () => {
    expect(ruleBody(globals, ".workspace-skeleton")).toMatch(
      /padding\s*:\s*24px/,
    );
    const visual = ruleBody(globals, ".skeleton-visual i");
    expect(visual).toMatch(/background\s*:\s*var\(--surface-subtle\)/);
    expect(visual).toMatch(/animation\s*:\s*skeleton-pulse\s+1\.4s/);
    expect(ruleBody(globals, ".skeleton-board-columns")).toMatch(
      /grid-template-columns\s*:\s*repeat\(4,\s*minmax\(240px,\s*1fr\)\)/,
    );
    expect(ruleBody(globals, ".skeleton-record")).toMatch(
      /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s+320px/,
    );
    expect(ruleBody(globals, ".skeleton-analytics")).toMatch(
      /grid-template-columns\s*:\s*repeat\(5,\s*1fr\)/,
    );
    expect(globals).toMatch(/@keyframes\s+skeleton-pulse/);
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

  it("keeps desktop, compact, tablet, narrow, and phone workspace contracts", () => {
    expect(ruleBody(globals, ".app-shell")).toMatch(
      /grid-template-columns\s*:\s*256px\s+minmax\(0,\s*1fr\)/,
    );

    const compact = mediaBody(globals, 1279);
    expect(ruleBody(compact, ".app-shell")).toMatch(
      /grid-template-columns\s*:\s*72px\s+minmax\(0,\s*1fr\)/,
    );
    expect(compact).toMatch(
      /\.task-board-scroll[\s\S]*overflow-x\s*:\s*auto/,
    );
    expect(compact).toMatch(
      /\.activity-rail[\s\S]*position\s*:\s*static/,
    );
    const compactLabels = ruleBody(
      compact,
      ".brand strong,\n  .project-context,\n  .nav-btn > span,\n  .team-context > span,\n  .theme-toggle button > span,\n  .sidebar-logout > span",
    );
    expect(compactLabels).toMatch(/position\s*:\s*absolute/);
    expect(compactLabels).toMatch(/clip-path\s*:\s*inset\(50%\)/);
    expect(compactLabels).not.toMatch(/display\s*:\s*none/);

    const tablet = mediaBody(globals, 1023);
    expect(ruleBody(tablet, ".app-content")).toMatch(
      /padding-inline\s*:\s*24px/,
    );
    expect(ruleBody(tablet, ".analytics-split")).toMatch(
      /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/,
    );

    const mobile = mediaBody(globals, 767);
    expect(mobile).toMatch(/\.app-shell\s*\{\s*display\s*:\s*block/);
    expect(ruleBody(mobile, ".mobile-app-bar")).toMatch(/display\s*:\s*flex/);
    const mobileBrand = ruleBody(mobile, ".mobile-app-bar .brand");
    expect(mobileBrand).toMatch(/justify-content\s*:\s*flex-start/);
    expect(mobileBrand).toMatch(/width\s*:\s*auto/);
    const mobileBrandText = ruleBody(mobile, ".mobile-app-bar .brand strong");
    expect(mobileBrandText).toMatch(/position\s*:\s*static/);
    expect(mobileBrandText).toMatch(/width\s*:\s*auto/);
    expect(mobileBrandText).toMatch(/height\s*:\s*auto/);
    expect(mobileBrandText).toMatch(/clip-path\s*:\s*none/);
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
    expect(ruleBody(mobile, ".drawer-panel")).toMatch(/width\s*:\s*100%/);
    expect(ruleBody(mobile, ".dialog-panel")).toMatch(/width\s*:\s*100%/);
    expect(mobile).toMatch(
      /button\s*,[\s\S]*textarea\s*\{[\s\S]*min-height\s*:\s*44px/,
    );
    expect(ruleBody(mobile, ".board-toolbar")).toMatch(
      /flex-wrap\s*:\s*wrap/,
    );
    expect(ruleBody(mobile, ".group-control")).toMatch(
      /margin-left\s*:\s*auto/,
    );

    const phone = mediaBody(globals, 479);
    expect(ruleBody(phone, ".workspace-skeleton")).toMatch(
      /padding-inline\s*:\s*12px/,
    );
    expect(ruleBody(phone, ".skeleton-analytics")).toMatch(
      /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/,
    );
  });

  it("gives narrow Analytics Retry and attention links 44px targets", () => {
    const mobile = mediaBody(globals, 767);
    expect(ruleBody(mobile, ".analytics-error .btn")).toMatch(
      /min-height\s*:\s*44px/,
    );
    const attentionLink = ruleBody(
      mobile,
      ".analytics-page .attention-list a",
    );
    expect(attentionLink).toMatch(/display\s*:\s*(?:inline-)?flex/);
    expect(attentionLink).toMatch(/min-width\s*:\s*44px/);
    expect(attentionLink).toMatch(/min-height\s*:\s*44px/);
  });

  it("gives narrow links and icon controls a 44 by 44 CSS target", () => {
    const mobile = mediaBody(globals, 767);
    const links = ruleBody(
      mobile,
      ".btn,\n  .brand,\n  .back-link,\n  .task-open,\n  .task-card-title,\n  .board-table a,\n  .experiment-table a,\n  .analytics-page .attention-list a",
    );
    expect(links).toMatch(/display\s*:\s*inline-flex/);
    expect(links).toMatch(/min-width\s*:\s*44px/);
    expect(links).toMatch(/min-height\s*:\s*44px/);

    const icons = ruleBody(
      mobile,
      ".nav-menu-toggle,\n  .sidebar-sheet-close,\n  .icon-btn,\n  .tag-remove,\n  .action-menu > summary",
    );
    expect(icons).toMatch(/width\s*:\s*44px/);
    expect(icons).toMatch(/height\s*:\s*44px/);
    expect(icons).toMatch(/min-width\s*:\s*44px/);
    expect(icons).toMatch(/min-height\s*:\s*44px/);
  });

  it("keeps the narrow Experiments primary action at 44px after the final cascade", () => {
    expect(
      ruleBody(
        mediaBody(workspaceCss(), 767),
        ".experiments-database .page-actions .btn",
      ),
    ).toMatch(/min-height\s*:\s*44px/);
  });

  it("stacks the pipeline and current Analytics hierarchy at the tablet breakpoint", () => {
    expect(globals).not.toMatch(/@media\s*\(max-width:\s*820px\)/);
    const sidebarAware = mediaBody(globals, 1023);
    expect(sidebarAware).toMatch(/\.pipeline\s*\{\s*flex-direction\s*:\s*column/);
    expect(sidebarAware).toMatch(
      /\.foundation-grid\s*\{\s*grid-template-columns\s*:\s*1fr/,
    );
    expect(sidebarAware).toMatch(
      /\.analytics-split\s*\{\s*grid-template-columns\s*:\s*(?:1fr|minmax\(0,\s*1fr\))/,
    );
    expect(sidebarAware).toMatch(
      /\.kpi-strip\s*\{\s*grid-template-columns\s*:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    );
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

  it("keeps a compact Experiment checkbox inside a 44px hit area with a focus ring", () => {
    const css = workspaceCss();
    const column = ruleBody(css, ".experiment-table .select-column");
    expect(column).toMatch(/width\s*:\s*44px/);
    expect(column).toMatch(/min-width\s*:\s*44px/);
    expect(column).toMatch(/padding\s*:\s*0/);

    const target = ruleBody(css, ".experiment-select-control");
    expect(target).toMatch(/display\s*:\s*inline-grid/);
    expect(target).toMatch(/width\s*:\s*44px/);
    expect(target).toMatch(/height\s*:\s*44px/);

    const glyph = ruleBody(css, ".experiment-select-control input");
    expect(glyph).toMatch(/width\s*:\s*15px/);
    expect(glyph).toMatch(/height\s*:\s*15px/);
    expect(glyph).toMatch(/min-width\s*:\s*15px/);
    expect(glyph).toMatch(/min-height\s*:\s*15px/);

    expect(
      ruleBody(
        css,
        ".experiment-select-control:has(input:focus-visible)",
      ),
    ).toMatch(/box-shadow\s*:\s*var\(--focus-ring\)/);
    const glyphFocus = ruleBody(
      css,
      ".experiment-table .experiment-select-control input:focus-visible",
    );
    expect(glyphFocus).toMatch(/outline\s*:\s*0/);
    expect(glyphFocus).toMatch(/box-shadow\s*:\s*none/);
  });

  it("contains visually hidden filter labels inside the horizontal toolbar", () => {
    const toolbar = ruleBody(workspaceCss(), ".database-toolbar");
    expect(toolbar).toMatch(/position\s*:\s*relative/);
    expect(toolbar).toMatch(/overflow-x\s*:\s*auto/);
  });

  it("pins all three desktop Compare identity columns at their exact widths", () => {
    const css = workspaceCss();
    const table = ruleBody(css, ".compare-table");
    expect(table).toMatch(/--compare-experiment-width\s*:\s*220px/);
    expect(table).toMatch(/--compare-task-width\s*:\s*180px/);
    expect(table).toMatch(/--compare-status-width\s*:\s*120px/);

    const experiment = ruleBody(css, ".compare-table .compare-experiment-column");
    expect(experiment).toMatch(/position\s*:\s*sticky/);
    expect(experiment).toMatch(/left\s*:\s*0/);
    expect(experiment).toMatch(
      /(?:min-)?width\s*:\s*var\(--compare-experiment-width\)/,
    );

    const task = ruleBody(css, ".compare-table .compare-task-column");
    expect(task).toMatch(/position\s*:\s*sticky/);
    expect(task).toMatch(/left\s*:\s*var\(--compare-experiment-width\)/);
    expect(task).toMatch(
      /(?:min-)?width\s*:\s*var\(--compare-task-width\)/,
    );

    const status = ruleBody(css, ".compare-table .compare-status-column");
    expect(status).toMatch(/position\s*:\s*sticky/);
    expect(status).toMatch(
      /left\s*:\s*calc\(var\(--compare-experiment-width\)\s*\+\s*var\(--compare-task-width\)\)/,
    );
    expect(status).toMatch(
      /(?:min-)?width\s*:\s*var\(--compare-status-width\)/,
    );
  });

  it("keeps only the narrower Experiment identity sticky at 767px", () => {
    const narrow = mediaBody(workspaceCss(), 767);
    const table = ruleBody(narrow, ".compare-table");
    const width = table.match(/--compare-experiment-width\s*:\s*(\d+)px/);
    expect(width).not.toBeNull();
    expect(Number(width?.[1])).toBeLessThanOrEqual(180);

    const experiment = ruleBody(
      narrow,
      ".compare-table .compare-experiment-column",
    );
    expect(experiment).toMatch(/position\s*:\s*sticky/);
    expect(experiment).toMatch(/left\s*:\s*0/);

    for (const selector of [
      ".compare-table .compare-task-column",
      ".compare-table .compare-status-column",
    ]) {
      const released = ruleBody(narrow, selector);
      expect(released, selector).toMatch(/position\s*:\s*static/);
      expect(released, selector).toMatch(/left\s*:\s*auto/);
      expect(released, selector).toMatch(/box-shadow\s*:\s*none/);
    }
  });

  it("uses 44px Compare targets and the narrow layout from 761 through 767px", () => {
    const css = workspaceCss();
    const narrow = mediaBody(css, 767);
    for (const selector of [
      ".compare-page .btn",
      ".compare-controls select",
      ".field-groups > summary",
      ".field-groups-menu label",
      ".compare-controls .diff-toggle",
      ".compare-selection .remove-compare",
      ".compare-table .compare-experiment-column a",
    ]) {
      expect(ruleBody(narrow, selector), selector).toMatch(
        /min-height\s*:\s*44px/,
      );
    }
    expect(ruleBody(narrow, ".compare-selection .remove-compare")).toMatch(
      /min-width\s*:\s*44px/,
    );
    expect(
      ruleBody(narrow, ".compare-table .compare-experiment-column a"),
    ).toMatch(/min-width\s*:\s*44px/);

    const selection = ruleBody(narrow, ".compare-selection");
    expect(selection).toMatch(
      /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/,
    );
    expect(selection).toMatch(/align-items\s*:\s*start/);
    const fields = ruleBody(narrow, ".field-groups");
    expect(fields).toMatch(/width\s*:\s*100%/);
    expect(fields).toMatch(/margin-left\s*:\s*0/);
    expect(ruleBody(narrow, ".field-groups-menu")).toMatch(/left\s*:\s*0/);

    expect(ruleBody(css, ".field-groups > summary")).toMatch(
      /min-height\s*:\s*34px/,
    );
    expect(ruleBody(css, ".compare-selection")).toMatch(
      /grid-template-columns\s*:\s*max-content\s+minmax\(0,\s*1fr\)\s+max-content/,
    );
  });

  it("uses AA semantic text for small Compare labels and Baseline accents", () => {
    const css = workspaceCss();
    for (const selector of [
      ".compare-table th",
      ".compare-controls > label",
      ".field-groups-menu label",
      ".compare-table th small",
      ".compare-selection li button",
    ]) {
      expect(ruleBody(css, selector), selector).toMatch(
        /color\s*:\s*var\(--text-primary\)/,
      );
    }
    expect(
      ruleBody(css, ".compare-table .compare-experiment-column a"),
    ).toMatch(/color\s*:\s*var\(--text-secondary\)/);
    expect(
      ruleBody(css, ".baseline-row > .compare-experiment-column a"),
    ).toMatch(/color\s*:\s*var\(--accent-foreground\)/);
    expect(ruleBody(css, ".baseline-chip")).toMatch(
      /color\s*:\s*var\(--accent-foreground\)/,
    );
    expect(ruleBody(css, ".baseline-row > .neutral-delta")).toMatch(
      /color\s*:\s*var\(--accent-foreground\)/,
    );

    const lightTokens = ruleBody(globals, ":root");
    const darkTokens = ruleBody(globals, '[data-theme="dark"]');
    const themes = [
      {
        name: "light",
        tokens: lightTokens,
        accentSubtle: hexColor(lightTokens, "--accent-subtle"),
      },
      {
        name: "dark",
        tokens: darkTokens,
        accentSubtle: mixColors(
          hexColor(darkTokens, "--accent"),
          hexColor(darkTokens, "--surface"),
          0.12,
        ),
      },
    ];

    for (const { name, tokens, accentSubtle } of themes) {
      const primary = hexColor(tokens, "--text-primary");
      const accentForeground = hexColor(tokens, "--accent-foreground");
      expect(
        contrastRatio(primary, hexColor(tokens, "--surface-subtle")),
        `${name} small Compare label contrast`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(accentForeground, accentSubtle),
        `${name} Baseline identity contrast`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(accentForeground, accentSubtle),
        `${name} Baseline Delta contrast`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(accentForeground, hexColor(tokens, "--surface-hover")),
        `${name} Baseline chip contrast`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("paints sticky identities with the correct normal and Baseline hover surface", () => {
    const css = workspaceCss();
    const columns = ":is(.compare-experiment-column, .compare-task-column, .compare-status-column)";
    expect(ruleBody(
      css,
      `.compare-table tbody tr:not(.baseline-row):hover > ${columns}`,
    )).toMatch(/background\s*:\s*var\(--surface-hover\)/);
    expect(ruleBody(
      css,
      ".compare-table tbody .baseline-row:hover > :is(th, td)",
    )).toMatch(/background\s*:\s*var\(--accent-subtle\)/);
  });

  it("joins a selected strip to table, empty, and loading surfaces without a doubled seam", () => {
    const css = workspaceCss();
    const strip = ruleBody(css, ".selection-strip");
    expect(strip).toMatch(/border\s*:\s*1px\s+solid\s+var\(--border\)/);
    expect(strip).toMatch(/border-radius\s*:\s*6px\s+6px\s+0\s+0/);
    expect(strip).toMatch(/background\s*:\s*var\(--surface\)/);

    for (const selector of [
      ".selection-strip + .experiment-table-scroll",
      ".selection-strip + .experiment-empty",
      ".selection-strip + .state-note",
    ]) {
      const body = ruleBody(css, selector);
      expect(body, selector).toMatch(/border-top\s*:\s*0/);
      expect(body, selector).toMatch(/border-radius\s*:\s*0\s+0\s+6px\s+6px/);
    }

    const empty = ruleBody(css, ".experiment-empty");
    expect(empty).toMatch(/border\s*:\s*1px\s+dashed\s+var\(--border-strong\)/);
    expect(empty).toMatch(/background\s*:\s*var\(--surface\)/);

    const loading = ruleBody(css, ".selection-strip + .state-note");
    expect(loading).toMatch(/margin\s*:\s*0/);
    expect(loading).toMatch(/max-width\s*:\s*none/);
    expect(loading).toMatch(/border\s*:\s*1px\s+solid\s+var\(--border\)/);
    expect(loading).toMatch(/background\s*:\s*var\(--surface\)/);
  });

  it("keeps Delta visually neutral", () => {
    const delta = ruleBody(workspaceCss(), ".neutral-delta");
    expect(delta).toMatch(/color\s*:\s*(#5f5e5b|var\(--ink-soft\))/i);
    expect(delta).not.toMatch(/good|crit|success|danger/i);
  });

  it("keeps every narrow Experiment Record control at least 44px", () => {
    const css = workspaceCss();
    expect(css).toMatch(/@media\s*\(max-width:\s*767px\)/);
    const narrow = mediaBody(css, 767);
    for (const selector of [
      ".experiment-detail-page .btn",
      ".experiment-detail-page .icon-btn",
      ".experiment-detail-page .action-menu > summary",
      ".experiment-detail-page .action-menu-panel .danger-subtle",
      ".experiment-detail-page .featured-toggle",
      ".experiment-detail-page .attachment-preview",
      '.experiment-detail-page input:not([type="checkbox"]):not([type="file"])',
      ".experiment-detail-page select",
    ]) {
      expect(ruleBody(narrow, selector), selector).toMatch(
        /(?:min-)?height\s*:\s*44px/,
      );
    }
    expect(ruleBody(narrow, ".experiment-detail-page .icon-btn")).toMatch(
      /min-width\s*:\s*44px/,
    );
    expect(ruleBody(
      narrow,
      ".experiment-detail-page .action-menu > summary",
    )).toMatch(/width\s*:\s*44px/);
    expect(ruleBody(narrow, ".experiment-detail-page .featured-toggle"))
      .toMatch(/width\s*:\s*44px/);
    expect(ruleBody(narrow, ".metric-edit-row")).toMatch(
      /grid-template-columns\s*:[^;]*44px\s+44px/,
    );
  });

  it("preserves Experiment Record textarea heights on narrow screens", () => {
    const css = workspaceCss();
    const narrow = mediaBody(css, 767);
    expect(narrow).not.toMatch(
      /\.experiment-detail-page textarea\s*\{[^}]*min-height/,
    );
    expect(ruleBody(css, ".property-grid textarea")).toMatch(
      /min-height\s*:\s*82px/,
    );
    expect(css).toMatch(
      /\.stacked-field textarea\s*,\s*\.decision-editor textarea\s*\{[^}]*min-height\s*:\s*110px/,
    );
    expect(ruleBody(css, ".timeline-note-form textarea")).toMatch(
      /min-height\s*:\s*76px/,
    );
  });

  it("keeps Duplicate baseline confirmation semantic in both themes", () => {
    const confirmation = ruleBody(
      workspaceCss(),
      ".baseline-confirmation",
    );
    expect(confirmation).toMatch(
      /border\s*:\s*1px\s+solid\s+var\(--border\)/,
    );
    expect(confirmation).toMatch(
      /background\s*:\s*var\(--surface-subtle\)/,
    );
    expect(confirmation).toMatch(/color\s*:\s*var\(--text-primary\)/);
    expect(confirmation).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("stacks editor forms and lets narrow save actions wrap", () => {
    const css = workspaceCss();
    const mobile = mediaBody(css, 767);
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
    const mobile = mediaBody(workspaceCss(), 767);
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
    const mobile = mediaBody(workspaceCss(), 767);
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
