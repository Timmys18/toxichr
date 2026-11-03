import { AsyncLocalStorage } from "node:async_hooks";
import type { AiRequest, AiResponse } from "./gateway";
export type CallContext = {
  assertOwner: () => Promise<void>;
  started: (request: AiRequest) => Promise<string>;
  finished: (id: string, elapsedMs: number, response?: AiResponse) => Promise<void>;
};
export const aiCallContext = new AsyncLocalStorage<CallContext>();
