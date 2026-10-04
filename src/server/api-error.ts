export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    /** Set-Cookie values to send with the error (e.g. Better Auth clearing a dead session). */
    public readonly setCookies: readonly string[] = [],
  ) {
    super(code);
  }
}
