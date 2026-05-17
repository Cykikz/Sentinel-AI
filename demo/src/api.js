import { login } from "./auth.js";
import { deadHelper } from "./helpers.js";

export function route(request) {
  deadHelper();
  return login(request.user);
}
