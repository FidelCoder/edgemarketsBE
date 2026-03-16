import { AppError } from "../domain/errors.js";
import { env } from "../config/env.js";

const bearerPrefix = "Bearer ";

export const assertCronAuthorized = (authorizationHeader: string | undefined): void => {
  if (!env.cronSecret) {
    return;
  }

  if (!authorizationHeader?.startsWith(bearerPrefix)) {
    throw new AppError("Missing Vercel cron authorization header.", 401);
  }

  const providedSecret = authorizationHeader.slice(bearerPrefix.length).trim();

  if (!providedSecret || providedSecret !== env.cronSecret) {
    throw new AppError("Invalid Vercel cron authorization header.", 401);
  }
};
