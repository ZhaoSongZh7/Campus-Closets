import { createAccount, signUpInput } from "@/server/accounts"
import { createSession } from "@/server/auth"
import { body, json, route } from "@/server/http"

export const POST = route(async (request) => {
  const account = await createAccount(signUpInput.parse(await body(request)))
  await createSession(account.id)
  return json({ account }, 201)
})
