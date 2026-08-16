import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const sourceRoot = join(projectRoot, "src");

function sourceFiles(directory = sourceRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[jt]sx?$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const files = sourceFiles();
const sources = files.map((path) => ({
  path: relative(projectRoot, path).replaceAll("\\", "/"),
  text: readFileSync(path, "utf8"),
}));

describe("React interface ownership", () => {
  it("keeps one React root and no interactive legacy HTML", () => {
    const indexHtml = readFileSync(join(projectRoot, "index.html"), "utf8");
    const roots = sources.flatMap(({ path, text }) => [...text.matchAll(/\bcreateRoot\s*\(/g)].map(() => path));

    expect(roots).toEqual(["src/main.tsx"]);
    expect(indexHtml).not.toMatch(/<(?:button|input|select|textarea|dialog|nav|aside)\b/i);
  });

  it("does not attach imperative UI listeners or mutate React-owned markup", () => {
    const forbidden = [
      /\.addEventListener\s*\(/,
      /\.(?:querySelector|querySelectorAll)\s*\(/,
      /\.(?:innerHTML|outerHTML|insertAdjacentHTML)\b/,
      /\.(?:onclick|onchange|oninput)\s*=/,
    ];
    const violations = sources.flatMap(({ path, text }) => forbidden.filter((pattern) => pattern.test(text)).map((pattern) => `${path}: ${pattern.source}`));

    expect(violations).toEqual([]);
  });

  it("keeps the only document access at the React bootstrap and transient download boundary", () => {
    const usages = sources.flatMap(({ path, text }) => [...text.matchAll(/\bdocument\.([A-Za-z]+)/g)].map((match) => `${path}:document.${match[1]}`)).sort();

    expect(usages).toEqual([
      "src/App.tsx:document.createElement",
      "src/main.tsx:document.getElementById",
    ]);
  });

  it("uses Carbon or scientific-ui instead of raw interactive JSX controls", () => {
    const rawControls = sources.flatMap(({ path, text }) => /<(?:button|input|select|textarea)\b/.test(text) ? [path] : []);

    expect(rawControls).toEqual([]);
  });
});
