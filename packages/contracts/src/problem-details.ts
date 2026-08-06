export type ValidationIssue = Readonly<{
  path: string;
  code: string;
  meta?: Readonly<Record<string, boolean | number | string | null>>;
}>;

export type ProblemDetails = Readonly<{
  type: string;
  title: string;
  status: number;
  code: string;
  instance: string;
  requestId: string;
  detail?: string;
  errors?: readonly ValidationIssue[];
}>;
