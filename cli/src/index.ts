#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { commitCheckCommand } from "./commands/commit-check.js";
import { configCommand } from "./commands/config.js";
import { dashboardCommand } from "./commands/dashboard.js";
import { dbCommand } from "./commands/db.js";
import { doctorCommand, testConnectionCommand } from "./commands/doctor.js";
import { explainCommand } from "./commands/explain.js";
import { healthCommand } from "./commands/health.js";
import { historyCommand } from "./commands/history.js";
import { hygieneCommand } from "./commands/hygiene.js";
import { hookCommand } from "./commands/hook.js";
import { impactCommand } from "./commands/impact.js";
import { initCommand } from "./commands/init.js";
import { reportCommand } from "./commands/report.js";
import { ruleCommand } from "./commands/rule.js";
import { scanCommand } from "./commands/scan.js";
import { traceCommand } from "./commands/trace.js";
import { watchCommand } from "./commands/watch.js";

const program = new Command();

program
  .name("sentinel")
  .description("SentinelAI - Autonomous Repository Intelligence Runtime")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(scanCommand);
program.addCommand(healthCommand);
program.addCommand(historyCommand);
program.addCommand(hygieneCommand);
program.addCommand(traceCommand);
program.addCommand(watchCommand);
program.addCommand(impactCommand);
program.addCommand(explainCommand);
program.addCommand(ruleCommand);
program.addCommand(configCommand);
program.addCommand(reportCommand);
program.addCommand(dashboardCommand);
program.addCommand(commitCheckCommand);
program.addCommand(hookCommand);
program.addCommand(doctorCommand);
program.addCommand(testConnectionCommand);
program.addCommand(dbCommand);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
