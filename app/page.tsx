import { redirect } from "next/navigation";
import { currentActor, homeFor } from "@/lib/server/auth/current";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const actor = await currentActor();
  redirect(actor ? homeFor(actor.role) : "/login");
}
