import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "../../domain/constants";
import { getDb } from "../db/client";
import { loadActor, SESSION_COOKIE, verifySessionToken, type Actor } from "./session";

/** For server components: the signed-in actor, or null. */
export async function currentActor(): Promise<Actor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const uid = verifySessionToken(token);
  if (!uid) return null;
  return loadActor(await getDb(), uid);
}

/** Redirects to /login when signed out, and to the actor's home when the role is not allowed. */
export async function requirePageActor(roles: Role[]): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  if (!roles.includes(actor.role)) redirect(homeFor(actor.role));
  return actor;
}

export function homeFor(role: Role): string {
  if (role === "recipient" || role === "family") return "/portal";
  if (role === "provider") return "/care/services?tab=referrals";
  return "/care";
}
