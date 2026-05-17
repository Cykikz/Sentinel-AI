import { extractImportSpecifiers } from "../parser/ast-parser.js";

export interface ImportTrace {
  filePath: string;
  imports: string[];
}

export function traceImportsInSource(content: string, filePath: string): ImportTrace {
  return {
    filePath,
    imports: extractImportSpecifiers(content, filePath),
  };
}
