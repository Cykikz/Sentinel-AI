import {
  findFunctionDefinitionsInSource,
  findFunctionCallsInSource,
} from "../parser/ast-parser.js";

export interface VariableTrace {
  filePath: string;
  symbol: string;
  definitions: number[];
  calls: number;
}

export function traceVariableInSource(
  content: string,
  filePath: string,
  symbol: string,
): VariableTrace {
  return {
    filePath,
    symbol,
    definitions: findFunctionDefinitionsInSource(content, filePath)
      .filter((definition) => definition.name === symbol)
      .map((definition) => definition.lineNumber),
    calls: findFunctionCallsInSource(content, filePath).filter((call) => call === symbol).length,
  };
}
