import "dotenv/config";
import { verifyBobConnection } from "../src/bob/client.js";

if (process.argv.includes("--demo")) {
  process.env.DEMO_MODE = "true";
}

const result = await verifyBobConnection();

console.log(result.message);
if (result.provider) console.log(`Provider: ${result.provider}`);
if (result.modelId) console.log(`Model: ${result.modelId}`);
if (result.responseTimeMs !== undefined) {
  console.log(`Response time: ${result.responseTimeMs}ms`);
}

process.exitCode = result.ok ? 0 : 1;
