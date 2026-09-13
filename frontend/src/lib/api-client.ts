import { API_URL } from "@/lib/constants";
import { useAuthStore } from "@/stores/auth-store";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
}

// Access tokens are short-lived (30 minutes) and the refresh token is otherwise never
// used — without this, any session older than 30 minutes starts silently 401ing on
// every authenticated request. Deduped via a shared in-flight promise so concurrent
// 401s (several queries firing at once on a stale session) trigger one refresh call,
// not one each.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        return (data.access_token as string) ?? null;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

async function throwApiError(response: Response): Promise<never> {
  let detail = response.statusText;
  try {
    const body = await response.json();
    detail = body.detail ?? detail;
  } catch {
    // response had no JSON body
  }
  throw new ApiError(response.status, detail);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = false, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  // Let the browser set Content-Type (with boundary) for multipart/form-data bodies.
  if (!(rest.body instanceof FormData)) {
    finalHeaders.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = useAuthStore.getState().accessToken;
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });

  if (response.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      useAuthStore.getState().setAccessToken(newToken);
      finalHeaders.set("Authorization", `Bearer ${newToken}`);
      response = await fetch(`${API_URL}${path}`, { ...rest, headers: finalHeaders });
    } else {
      useAuthStore.getState().clearSession();
    }
  }

  if (!response.ok) return throwApiError(response);

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function getBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const { auth = false, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (auth) {
    const token = useAuthStore.getState().accessToken;
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }
  let response = await fetch(`${API_URL}${path}`, { ...rest, method: "GET", headers: finalHeaders });

  if (response.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      useAuthStore.getState().setAccessToken(newToken);
      finalHeaders.set("Authorization", `Bearer ${newToken}`);
      response = await fetch(`${API_URL}${path}`, { ...rest, method: "GET", headers: finalHeaders });
    } else {
      useAuthStore.getState().clearSession();
    }
  }

  if (!response.ok) throw new ApiError(response.status, response.statusText);
  return response.blob();
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  getBlob,
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  postForm: <T>(path: string, formData: FormData, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body: formData }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "DELETE" }),
};
