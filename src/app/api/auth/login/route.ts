import { findLogin, getAccount, logInInput } from "@/server/accounts"
import { createSession, verifyPassword } from "@/server/auth"
import { body, HttpError, json, route } from "@/server/http"

export const POST = route(async (request) => {
  const input = logInInput.parse(await body(request))
  const user = await findLogin(input.email)
  // Same message and similar timing whether the email or the password is wrong.
  const ok = await verifyPassword(input.password, user?.password_hash ?? null)
  if (!user || !ok) throw new HttpError(401, "That email and password don't match an account.")
  await createSession(user.id)
  return json({ account: await getAccount(user.id) })
})
