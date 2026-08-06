export type RequestContext = Readonly<{
  requestId: string;
}>;

export interface RequestContextPort {
  get(): RequestContext | undefined;
  run<Result>(context: RequestContext, work: () => Result): Result;
}
