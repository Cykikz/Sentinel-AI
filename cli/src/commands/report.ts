import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const reportCommand = new Command("report")
  .description("Print sentinel-report.md")
  .option("--target <path>", "Repository path", process.cwd())
  .option("--format <format>", "Output format: md or html", "md")
  .option("--executive", "Print executive summary instead of developer report")
  .action((opts: { target: string; format: string; executive?: boolean }) => {
    const reportPath = opts.executive
      ? path.join(opts.target, ".sentinel", "executive-summary.md")
      : path.join(opts.target, "sentinel-report.md");
    if (!existsSync(reportPath)) {
      console.log("No report found. Run: sentinel scan --deep");
      return;
    }

    const markdown = readFileSync(reportPath, "utf8");
    if (opts.format === "html") {
      console.log(renderHtml(markdown));
      return;
    }

    if (opts.format !== "md") {
      throw new Error("--format must be md or html");
    }

    console.log(markdown);
  });

function renderHtml(markdown: string): string {
  const body = markdown
    .split(/\r?\n/)
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
      if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      if (line.startsWith("- ")) return `<li>${escapeHtml(line.slice(2))}</li>`;
      if (!line.trim()) return "";
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>SentinelAI Report</title>
  <style>body{font-family:system-ui,sans-serif;max-width:900px;margin:40px auto;line-height:1.5}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
