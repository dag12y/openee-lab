import { executeDispatch } from "../../../packages/simulation-core/src/dispatch.js";

addEventListener("message", async (event: MessageEvent<unknown>) => {
  // The browser adapter terminates this dedicated worker to stop synchronous work.
  const outcome = await executeDispatch(event.data, { requested: false });
  postMessage(outcome);
}, { once: true });
