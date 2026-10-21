// The example's notion of "who is this user": an opaque id in a first-party
// cookie. It satisfies the API's identity rule (1–128 printable ASCII, no
// whitespace, no "@") and is never an email or an internal user id.
import { randomBytes } from "node:crypto";

export const COOKIE = "stp_example_uid";
const VALID = /^[\x21-\x7e]{1,128}$/;

export function readIdentity(req) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return VALID.test(value) && !value.includes("@") ? value : null;
    }
  }
  return null;
}

export function mintIdentity() {
  return "u_" + randomBytes(6).toString("hex");
}

export function ensureIdentity(req, res) {
  let id = readIdentity(req);
  if (!id) {
    id = mintIdentity();
    res.append("Set-Cookie", `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`);
  }
  return id;
}

export function clearIdentity(res) {
  res.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
