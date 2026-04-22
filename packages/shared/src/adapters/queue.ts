export interface QueueJob {
  kind: string;
  payload: unknown;
}

export interface ClaimedJob {
  id: string;
  kind: string;
  payload: unknown;
}

export interface QueueProvider {
  enqueue(job: QueueJob): Promise<string>;
  claim(workerId: string, kinds: string[]): Promise<ClaimedJob | null>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, error: string): Promise<void>;
}
