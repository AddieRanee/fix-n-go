import axios from "axios";

const baseURL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:4000" : window.location.origin);

export const api = axios.create({
  baseURL: `${baseURL.replace(/\/$/, "")}/api`
});

type ApiErrorSnapshot = {
  at: string;
  method?: string;
  url?: string;
  status?: number;
  message: string;
  response?: unknown;
};

let lastApiError: ApiErrorSnapshot | null = null;

export function getLastApiError(): ApiErrorSnapshot | null {
  return lastApiError;
}

function setLastApiError(next: ApiErrorSnapshot | null) {
  lastApiError = next;
  try {
    window.dispatchEvent(
      new CustomEvent("fixngo:last-api-error", { detail: lastApiError })
    );
  } catch {
    // ignore
  }
}

export function setAuthToken(token: string | null) {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const method = err?.config?.method as string | undefined;
    const url = err?.config?.url as string | undefined;
    const status = err?.response?.status as number | undefined;
    const response = err?.response?.data as unknown;
    const message =
      (typeof err?.message === "string" && err.message) ||
      (typeof err?.response?.data?.error === "string" && err.response.data.error) ||
      "Request failed";

    setLastApiError({
      at: new Date().toISOString(),
      method: method?.toUpperCase(),
      url,
      status,
      message,
      response
    });

    return Promise.reject(err);
  }
);
