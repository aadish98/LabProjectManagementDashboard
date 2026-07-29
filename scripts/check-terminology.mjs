import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
const sourceRoot = join(root, "src");
const ignoredAttributes = new Set([
  "accept",
  "className",
  "data-testid",
  "href",
  "id",
  "idPrefix",
  "key",
  "name",
  "rel",
  "role",
  "target",
  "type",
  "value"
]);

const forbiddenTerms = [
  { pattern: /\bemployees?\b/gi, replacement: "Member" },
  { pattern: /\blab members?\b/gi, replacement: "Member" },
  { pattern: /\b(?:person|people)\b/gi, replacement: "Member" }
];

const canonicalPhrases = [
  { pattern: /\baccess roles?\b/gi, allowed: new Set(["Access role", "Access roles"]) },
  {
    pattern: /\btask[ -]?log workbooks?\b/gi,
    allowed: new Set(["Task-log workbook", "Task-log workbooks"])
  },
  { pattern: /\badmin workbooks?\b/gi, allowed: new Set(["Admin workbook", "Admin workbooks"]) },
  {
    pattern: /\bactive task tabs?\b/gi,
    allowed: new Set(["Active task tab", "Active task tabs"])
  }
];
const technicalAllowlist = new Map([
  ["src/features/setup/RoleConfirmation.tsx", new Set(["employee"])]
]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.includes(".test.") ? [path] : [];
  });
}

function renderedFragments(sourceFile) {
  const fragments = [];
  const add = (node, text) => {
    const value = text.replace(/\s+/g, " ").trim();
    if (!value) return;
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    fragments.push({ line: position.line + 1, text: value });
  };

  const collectExpressionStrings = (node) => {
    if (ts.isJsxAttribute(node)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      add(node, node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      add(node, [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" "));
    }
    ts.forEachChild(node, collectExpressionStrings);
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      add(node, node.text);
    } else if (ts.isJsxAttribute(node)) {
      const attributeName = node.name.getText(sourceFile);
      if (
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        !ignoredAttributes.has(attributeName)
      ) {
        add(node.initializer, node.initializer.text);
      } else if (
        node.initializer &&
        ts.isJsxExpression(node.initializer) &&
        !ignoredAttributes.has(attributeName)
      ) {
        collectExpressionStrings(node.initializer);
      }
      return;
    } else if (ts.isJsxExpression(node)) {
      collectExpressionStrings(node);
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return fragments;
}

function repoPath(path) {
  return relative(root, path).split("\\").join("/");
}

const violations = [];
for (const path of sourceFiles(sourceRoot)) {
  const sourceFile = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  for (const fragment of renderedFragments(sourceFile)) {
    for (const rule of forbiddenTerms) {
      for (const match of fragment.text.matchAll(rule.pattern)) {
        const allowlist = technicalAllowlist.get(repoPath(path));
        if (allowlist?.has(match[0].toLowerCase())) continue;
        violations.push({
          path,
          line: fragment.line,
          found: match[0],
          expected: rule.replacement
        });
      }
    }
    for (const rule of canonicalPhrases) {
      for (const match of fragment.text.matchAll(rule.pattern)) {
        if (!rule.allowed.has(match[0])) {
          violations.push({
            path,
            line: fragment.line,
            found: match[0],
            expected: [...rule.allowed].join(" or ")
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("User-facing terminology violations:");
  for (const violation of violations) {
    console.error(
      `${repoPath(violation.path)}:${violation.line} "${violation.found}" → ${violation.expected}`
    );
  }
  process.exitCode = 1;
} else {
  console.log("User-facing terminology matches the product glossary.");
}
