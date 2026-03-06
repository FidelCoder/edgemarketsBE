import { TriggerJobStatus } from "./types.js";

export type TriggerTransition = "claim" | "complete" | "retry" | "fail";

const transitionMap: Record<TriggerJobStatus, TriggerTransition[]> = {
  pending: ["claim"],
  processing: ["complete", "retry", "fail"],
  completed: [],
  failed: []
};

export const isTransitionAllowed = (
  currentStatus: TriggerJobStatus,
  transition: TriggerTransition
): boolean => {
  return transitionMap[currentStatus].includes(transition);
};

export const assertTransitionAllowed = (
  currentStatus: TriggerJobStatus,
  transition: TriggerTransition
): void => {
  if (isTransitionAllowed(currentStatus, transition)) {
    return;
  }

  throw new Error(
    `Invalid trigger job transition: ${currentStatus} cannot apply ${transition}.`
  );
};

export const nextStatusForTransition = (transition: TriggerTransition): TriggerJobStatus => {
  if (transition === "claim") {
    return "processing";
  }

  if (transition === "complete") {
    return "completed";
  }

  if (transition === "retry") {
    return "pending";
  }

  return "failed";
};
