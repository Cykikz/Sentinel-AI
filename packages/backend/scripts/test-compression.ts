import { compressIntelligence } from "../src/compression/pipeline.js";

const verbose = Array.from({ length: 30 }, (_, index) =>
  [
    `The authentication module located in src/auth/auth.js on line ${index + 1} contains a password variable that is being passed directly to the logging utility.`,
    "The logging utility then sends the password to an external analytics service.",
    "This is a critical security leak and should be fixed by removing sensitive values from logs and analytics.",
  ].join(" "),
).join("\n");

const result = compressIntelligence(verbose, { mode: "ultra", maxTokens: 120 });

if (result.metrics.savingsPercent < 70) {
  throw new Error(`Expected >=70% savings, got ${result.metrics.savingsPercent}%`);
}

if (!result.compressed.includes("password")) {
  throw new Error("Compression dropped key technical term: password");
}

console.log("Compression smoke test: OK");
console.log(
  `Token savings: ${result.metrics.rawTokens} -> ${result.metrics.compressedTokens} (${result.metrics.savingsPercent}%)`,
);
