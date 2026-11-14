import { accountPatch, deleteAccount, updateAccount } from "@/server/accounts"
import { destroySession } from "@/server/auth"
import { body, json, requireUser, route } from "@/server/http"

export const PATCH = route(async (request) => {
  const userId = await requireUser()
  return json({ account: await updateAccount(userId, accountPatch.parse(await body(request))) })
})

export const DELETE = route(async () => {
  const userId = await requireUser()
  await destroySession()
  await deleteAccount(userId)
  return json({ ok: true })
})
