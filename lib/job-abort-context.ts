import { AsyncLocalStorage } from "node:async_hooks";

const jobAbortContext = new AsyncLocalStorage<AbortSignal>();

export function runWithJobAbortSignal<T>(signal: AbortSignal, task: () => Promise<T>) {
  return jobAbortContext.run(signal, task);
}

export function getJobAbortSignal() {
  return jobAbortContext.getStore();
}
