import { HttpError } from "./http";
import { loadJob, type Job } from "./jobs";
import { getSession } from "./session";

/** Loads a job owned by the current browser session, or throws 404. */
export async function requireJob(ctx: { params: Promise<{ id: string }> }): Promise<Job> {
  const { id } = await ctx.params;
  const session = await getSession();
  const job = await loadJob(id, session.sid!);
  if (!job) throw new HttpError(404, "Conversion not found or expired.");
  return job;
}
