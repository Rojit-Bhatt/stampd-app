const API_URL = (import.meta.env.VITE_API_URL as string) || "http://localhost:5001";

interface RequestOptions extends RequestInit {
  body?: any;
}

export async function apiRequest<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_URL}${path}`;

  const headers = new Headers(options.headers || {});
  
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (typeof window !== "undefined") {
    const token = localStorage.getItem("auth_token");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorMsg = "Something went wrong";
    try {
      const errJson = await response.json();
      errorMsg = errJson.message || errorMsg;
    } catch (_) {
      // ignore
    }
    throw new Error(errorMsg);
  }

  try {
    return await response.json() as T;
  } catch (_) {
    return {} as T;
  }
}
