import { Command } from "commander";
import { verifyBobConnection } from "../../../packages/backend/src/bob/client.js";

export const doctorCommand = new Command("doctor")
  .description("Check local SentinelAI foundation and IBM Bob connectivity")
  .option("--demo", "Skip live IBM call and validate local Bob wiring")
  .action(async (opts: { demo?: boolean }) => {
    await runDoctor(Boolean(opts.demo));
  });

export const testConnectionCommand = new Command("test-connection")
  .description("Alias for doctor")
  .option("--demo", "Skip live IBM call and validate local Bob wiring")
  .action(async (opts: { demo?: boolean }) => {
    await runDoctor(Boolean(opts.demo));
  });

async function runDoctor(demo: boolean): Promise<void> {
  if (demo) process.env.DEMO_MODE = "true";

  const result = await verifyBobConnection();
  console.log(`SentinelAI doctor: ${result.status}`);
  console.log(result.message);

  if (result.provider) console.log(`Provider: ${result.provider}`);
  if (result.modelId) console.log(`Model: ${result.modelId}`);
  if (result.responseTimeMs !== undefined) {
    console.log(`Response time: ${result.responseTimeMs}ms`);
  }

  process.exitCode = result.ok ? 0 : 1;
}
