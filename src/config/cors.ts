import { env } from "./env.js";

const escapeRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const patternToRegex = (pattern: string): RegExp => {
  const escaped = escapeRegex(pattern).replace(/\\\*/g, ".*");
  return new RegExp(`^${escaped}$`);
};

const matchesAnyPattern = (origin: string): boolean => {
  return env.allowedOrigins.some((pattern) => patternToRegex(pattern).test(origin));
};

export const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) {
    return true;
  }

  if (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")) {
    return true;
  }

  return matchesAnyPattern(origin);
};
