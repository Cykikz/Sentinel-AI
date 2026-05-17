import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const OUTPUT_MARKER = "---output---";

export interface BobShellRequest {
  apiKey: string;
  prompt: string;
  cwd?: string;
}

export async function callBobShell(request: BobShellRequest): Promise<string> {
  const command = getBobShellCommand();
  const args = [
    ...command.argsPrefix,
    "--auth-method",
    "api-key",
    "--accept-license",
    "--hide-intermediary-output",
    "-p",
    request.prompt,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(command.executable, args, {
      cwd: request.cwd ?? process.cwd(),
      env: {
        ...process.env,
        BOBSHELL_API_KEY: request.apiKey,
      },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Bob Shell exited with code ${code}: ${stderr || stdout}`));
        return;
      }

      resolve(cleanBobShellOutput(stdout));
    });
  });
}

function getBobShellCommand(): { executable: string; argsPrefix: string[] } {
  if (process.platform !== "win32") {
    return { executable: "bob", argsPrefix: [] };
  }

  const appData = process.env.APPDATA;
  if (appData) {
    const bobBundle = path.join(
      appData,
      "npm",
      "node_modules",
      "bobshell",
      "bundle",
      "bob.js",
    );

    if (existsSync(bobBundle)) {
      return { executable: process.execPath, argsPrefix: [bobBundle] };
    }
  }

  return { executable: "bob.cmd", argsPrefix: [] };
}

function cleanBobShellOutput(output: string): string {
  const firstMarker = output.indexOf(OUTPUT_MARKER);
  if (firstMarker >= 0) {
    const start = firstMarker + OUTPUT_MARKER.length;
    const secondMarker = output.indexOf(OUTPUT_MARKER, start);

    if (secondMarker > start) {
      return output.slice(start, secondMarker).trim();
    }
  }

  return output.replace(/\[using tool attempt_completion:[\s\S]*?\]/g, "").trim();
}
