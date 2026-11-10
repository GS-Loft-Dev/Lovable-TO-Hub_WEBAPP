import { NextResponse } from "next/server";
import { HubSpotAuthError } from "./integrations/hubspot";
import { LovableAuthError } from "./integrations/lovable";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps a route handler so thrown errors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      const err = e as Error;
      const status =
        e instanceof HttpError ? e.status : e instanceof HubSpotAuthError || e instanceof LovableAuthError ? 401 : 500;
      if (status === 500) console.error(err);
      return NextResponse.json({ error: err.message || "Unexpected error" }, { status });
    }
  };
}
