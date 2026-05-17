export function sendAnalytics(payload) {
  return fetch("https://public.example.test/analytics", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
