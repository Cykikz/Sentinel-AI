import path from "node:path";
import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
import TypeScript from "tree-sitter-typescript";

export interface ParsedSource {
  filePath: string;
  content: string;
  tree: Parser.Tree;
  root: Parser.SyntaxNode;
}

export interface AstFunctionDefinition {
  name: string;
  lineNumber: number;
  exported: boolean;
  params: string[];
  body: string;
}

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

export function isSourceFile(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function sourceExtensions(): string[] {
  return [...SOURCE_EXTENSIONS];
}

export function parseSource(content: string, filePath: string): ParsedSource {
  const parser = new Parser();
  parser.setLanguage(languageForFile(filePath));
  const tree = parser.parse(content);

  return {
    filePath,
    content,
    tree,
    root: tree.rootNode,
  };
}

export function extractImportSpecifiers(content: string, filePath: string): string[] {
  const parsed = parseSource(content, filePath);
  const imports: string[] = [];

  for (const node of walk(parsed.root)) {
    if (node.type === "import_statement" || node.type === "export_statement") {
      const source = node.childForFieldName("source");
      const specifier = source ? stringValue(source) : null;
      if (specifier) imports.push(specifier);
      continue;
    }

    if (node.type !== "call_expression") continue;

    const callee = node.childForFieldName("function");
    if (callee?.type !== "identifier" && callee?.type !== "import") continue;
    if (callee.text !== "require" && callee.text !== "import") continue;

    const argument = firstStringArgument(node.childForFieldName("arguments"));
    if (argument) imports.push(argument);
  }

  return uniqueSorted(imports);
}

export function extractNamedImports(content: string, filePath: string): Map<string, string> {
  const parsed = parseSource(content, filePath);
  const imports = new Map<string, string>();

  for (const statement of parsed.root.descendantsOfType("import_statement")) {
    const source = statement.childForFieldName("source");
    const specifier = source ? stringValue(source) : null;
    if (!specifier?.startsWith(".")) continue;

    for (const importNode of statement.descendantsOfType("import_specifier")) {
      const importedName = importNode.childForFieldName("name")?.text;
      const localName = importNode.childForFieldName("alias")?.text ?? importedName;
      if (localName) imports.set(localName, specifier);
    }
  }

  return imports;
}

export function extractExportNames(content: string, filePath: string): string[] {
  const parsed = parseSource(content, filePath);
  const exports: string[] = [];

  for (const statement of parsed.root.descendantsOfType("export_statement")) {
    const declaration = statement.childForFieldName("declaration");

    if (declaration?.type === "function_declaration") {
      const name = declaration.childForFieldName("name")?.text;
      if (name) exports.push(name);
      continue;
    }

    if (declaration?.type === "lexical_declaration" || declaration?.type === "variable_declaration") {
      for (const declarator of declaration.descendantsOfType("variable_declarator")) {
        const name = declarator.childForFieldName("name")?.text;
        if (name) exports.push(name);
      }
      continue;
    }

    for (const specifier of statement.descendantsOfType("export_specifier")) {
      const name =
        specifier.childForFieldName("alias")?.text ??
        specifier.childForFieldName("name")?.text;
      if (name) exports.push(name);
    }
  }

  for (const assignment of parsed.root.descendantsOfType("assignment_expression")) {
    const left = assignment.childForFieldName("left");
    if (!left?.text.startsWith("module.exports")) continue;

    const property = left.childForFieldName("property")?.text;
    exports.push(property ?? "default");
  }

  return uniqueSorted(exports);
}

export function findFunctionDefinitionsInSource(
  content: string,
  filePath: string,
): AstFunctionDefinition[] {
  const parsed = parseSource(content, filePath);
  const definitions: AstFunctionDefinition[] = [];

  for (const node of walk(parsed.root)) {
    if (node.type === "function_declaration") {
      const name = node.childForFieldName("name")?.text;
      if (!name) continue;

      definitions.push({
        name,
        lineNumber: node.startPosition.row + 1,
        exported: hasAncestor(node, "export_statement"),
        params: readParams(node.childForFieldName("parameters")),
        body: node.childForFieldName("body")?.text ?? "",
      });
      continue;
    }

    if (node.type !== "variable_declarator") continue;

    const value = node.childForFieldName("value");
    if (value?.type !== "arrow_function" && value?.type !== "function") continue;

    const name = node.childForFieldName("name")?.text;
    if (!name) continue;

    definitions.push({
      name,
      lineNumber: node.startPosition.row + 1,
      exported: hasAncestor(node, "export_statement"),
      params: readParams(value.childForFieldName("parameters")),
      body: value.childForFieldName("body")?.text ?? "",
    });
  }

  return definitions.sort((a, b) => a.lineNumber - b.lineNumber);
}

export function findFunctionCallsInSource(content: string, filePath: string): string[] {
  const parsed = parseSource(content, filePath);
  const calls: string[] = [];

  for (const node of parsed.root.descendantsOfType("call_expression")) {
    const callee = node.childForFieldName("function");
    const name = callName(callee);
    if (name) calls.push(name);
  }

  return calls;
}

function languageForFile(filePath: string): unknown {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".ts") return TypeScript.typescript;
  if (extension === ".tsx") return TypeScript.tsx;
  return JavaScript;
}

function* walk(node: Parser.SyntaxNode): Generator<Parser.SyntaxNode> {
  yield node;
  for (const child of node.namedChildren) yield* walk(child);
}

function stringValue(node: Parser.SyntaxNode): string | null {
  if (node.type !== "string") return null;

  const value = node.text;
  if (value.length < 2) return null;

  return value.slice(1, -1);
}

function firstStringArgument(node: Parser.SyntaxNode | null): string | null {
  if (!node) return null;
  const first = node.namedChildren.find((child) => child.type === "string");
  return first ? stringValue(first) : null;
}

function readParams(node: Parser.SyntaxNode | null): string[] {
  if (!node) return [];

  const params: string[] = [];
  const candidates =
    node.type === "formal_parameters"
      ? node.namedChildren
      : [node];

  for (const candidate of candidates) {
    const name = readParamName(candidate);
    if (name) params.push(name);
  }

  return params;
}

function readParamName(node: Parser.SyntaxNode): string | null {
  if (node.type === "identifier") return node.text;

  const pattern = node.childForFieldName("pattern");
  if (pattern?.type === "identifier") return pattern.text;

  const identifier = node.descendantsOfType("identifier")[0];
  return identifier?.text ?? null;
}

function callName(node: Parser.SyntaxNode | null): string | null {
  if (!node) return null;
  if (node.type === "identifier") return node.text;
  if (node.type === "member_expression") {
    return node.childForFieldName("property")?.text ?? null;
  }
  return null;
}

function hasAncestor(node: Parser.SyntaxNode, type: string): boolean {
  let current = node.parent;
  while (current) {
    if (current.type === type) return true;
    current = current.parent;
  }
  return false;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
