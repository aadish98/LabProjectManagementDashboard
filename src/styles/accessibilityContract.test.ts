import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const stylesDirectory = join(process.cwd(), "src", "styles");
const tokensCss = readFileSync(join(stylesDirectory, "tokens.css"), "utf8");
const layoutCss = readFileSync(join(stylesDirectory, "layout.css"), "utf8");
const foundationCss = readFileSync(
  join(stylesDirectory, "features", "foundation.css"),
  "utf8"
);
const responsiveCss = readFileSync(
  join(stylesDirectory, "features", "responsive.css"),
  "utf8"
);
const indexHtml = readFileSync(join(process.cwd(), "index.html"), "utf8");

function cssPaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return cssPaths(path);
    return entry.name.endsWith(".css") ? [path] : [];
  });
}

const featuresCss = cssPaths(join(stylesDirectory, "features"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const styleFiles = [
  ...cssPaths(stylesDirectory),
  ...cssPaths(join(process.cwd(), "src", "features", "gantt", "styles"))
];

function cssFiles() {
  return styleFiles.map((path) => ({ path, css: readFileSync(path, "utf8") }));
}

describe("CSS accessibility contract", () => {
  it("keeps one global token root", () => {
    const rootCount = cssFiles().reduce(
      (count, { css }) => count + (css.match(/:root\s*\{/g)?.length ?? 0),
      0
    );
    expect(rootCount).toBe(1);
  });

  it("does not override interactive controls below 44px", () => {
    const violations: string[] = [];
    for (const { path, css } of cssFiles()) {
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = match[1].trim();
        if (
          !/(button|\.button|\.role-checkbox(?!-row)|\.manager-tab|\.employee-filter-option|\.gantt-chip|\.fab|__action|__option|__tab|__dismiss|__close)/.test(
            selector
          )
        ) {
          continue;
        }
        const minHeight = match[2].match(/min-height:\s*([0-9.]+)(px|rem)/);
        if (!minHeight) continue;
        const pixels =
          Number(minHeight[1]) * (minHeight[2] === "rem" ? 16 : 1);
        if (pixels < 44) {
          violations.push(`${path}: ${selector} = ${minHeight[0]}`);
        }
      }
    }
    expect(violations).toEqual([]);
    expect(tokensCss).toMatch(/--control-hit-size:\s*44px/);
    expect(featuresCss).toMatch(
      /\.lab-member__advanced summary\s*\{[^}]*min-height:\s*var\(--control-hit-size\)/
    );
    expect(featuresCss).toMatch(
      /\.gantt-schedule-table summary\s*\{[^}]*min-height:\s*44px/
    );
    expect(featuresCss).toMatch(
      /\.diagnostics-disclosure summary\s*\{[^}]*min-height:\s*44px/
    );
  });

  it("reserves the full stacked manager action area at every viewport size", () => {
    expect(tokensCss).toMatch(
      /--safe-manager-actions-bottom:\s*calc\(7\.25rem \+ max\(1rem, env\(safe-area-inset-bottom\)\)\)/
    );
    expect(layoutCss).toMatch(
      /\.manager-shell--with-actions\s*\{[^}]*padding-bottom:\s*var\(--safe-manager-actions-bottom\)/
    );
    expect(featuresCss).toMatch(
      /\.fab-group\s*\{[^}]*gap:\s*0\.75rem/
    );
    expect(featuresCss).toMatch(
      /\.fab-group \.fab\s*\{[^}]*position:\s*static/
    );
    expect(featuresCss).toMatch(
      /\.fab--secondary\s*\{[^}]*min-height:\s*3rem/
    );
  });

  it("keeps browser zoom enabled and system font fallbacks available", () => {
    const document = new DOMParser().parseFromString(indexHtml, "text/html");
    const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute("content");

    expect(viewport).toContain("width=device-width");
    expect(viewport).toContain("initial-scale=1");
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
    const primaryFontToken = "--font-" + "primary";
    expect(tokensCss).toMatch(
      new RegExp(
        `${primaryFontToken}:[^;]*-apple-system[^;]*BlinkMacSystemFont[^;]*"Segoe UI"[^;]*sans-serif`
      )
    );
    expect(foundationCss).toMatch(/text-size-adjust:\s*100%/);
  });

  it("provides a deterministic 320px reflow contract without hiding overflow", () => {
    expect(foundationCss).toMatch(/body\s*\{[^}]*min-width:\s*320px/);
    expect(foundationCss).toMatch(/body\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(foundationCss).not.toMatch(/body\s*\{[^}]*(?:overflow-x:\s*hidden|width:\s*[4-9]\d{2,}px)/);
    expect(responsiveCss).toMatch(/@media \(max-width:\s*720px\)/);
    expect(responsiveCss).toMatch(
      /@media \(max-width:\s*720px\)[\s\S]*?\.kanban-board--four\s*\{[^}]*grid-template-columns:\s*1fr/
    );
    expect(responsiveCss).toMatch(
      /@media \(max-width:\s*720px\)[\s\S]*?\.page-shell\s*\{[^}]*padding:\s*1rem 1rem 2rem/
    );
    expect(featuresCss).toMatch(
      /@media \(max-width:\s*720px\)[\s\S]*?\.tab-reorder-row\s*\{[^}]*grid-template-columns:\s*1fr/
    );
  });
});
