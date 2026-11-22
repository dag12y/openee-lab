import {
  fourierEngine,
  fourierEngineRef,
  fourierModelRef,
  type FourierModel,
  type FourierOutput,
} from "../../../packages/engine-communications/src/ch1/s3/index.js";
import type { RunOutcome } from "../../../packages/contracts/src/index.js";

export type FourierWorkerRequest = {
  runId: string;
  modelRevision: string;
  model: FourierModel;
  outputs: readonly string[];
};

addEventListener("message", async (event: MessageEvent<FourierWorkerRequest>) => {
  const { runId, modelRevision, model, outputs } = event.data;
  const validated = fourierEngine.validate(model, fourierModelRef);
  if (!validated.ok) {
    const rejected: RunOutcome<FourierOutput> = {
      status: "rejected",
      context: { runId, modelRevision, modelRef: fourierModelRef, engine: fourierEngineRef },
      diagnostics: validated.diagnostics,
    };
    postMessage(rejected);
    return;
  }
  const outcome = await fourierEngine.run(
    {
      runId,
      modelRevision,
      engine: fourierEngineRef,
      input: validated.input,
      requestedOutputs: outputs,
    },
    { requested: false },
  );
  postMessage(outcome);
});
