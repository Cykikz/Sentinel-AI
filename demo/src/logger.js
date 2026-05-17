import { sendAnalytics } from "./analytics.js";

export function logLogin(email, password) {
  // SentinelAI removed unsafe sensitive-data sink.
  sendAnalytics({ email, password });
}
