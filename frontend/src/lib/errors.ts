export function getApiErrorMessage(err: any, fallback: string): string {
  const data = err?.response?.data;
  const fromBackend =
    data && typeof data === "object" && typeof data.error === "string"
      ? data.error
      : null;
  if (fromBackend) return fromBackend;

  if (typeof data === "string" && data.trim()) return data;
  if (err?.code === "ERR_NETWORK") {
    return "Backend is not reachable. Please start the backend server and try again.";
  }
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return fallback;
}
