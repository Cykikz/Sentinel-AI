import { logLogin } from "./logger.js";

export function login(user) {
  const password = user.password;
  logLogin(user.email, password);
  return { ok: true };
}
