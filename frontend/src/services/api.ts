const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export function apiUpload<T>(path: string, body: FormData, onProgress?: (percent: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE_URL}/api/v1${path}`);
    request.responseType = "json";
    request.timeout = 10 * 60 * 1000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error(`Cannot reach the EDUPULSE backend at ${API_BASE_URL}. Start the FastAPI server and try again.`));
    request.ontimeout = () => reject(new Error("The upload or analysis timed out. Check the backend and try again."));
    request.onload = () => {
      const payload = request.response as ({ detail?: string; error?: string } & T) | null;
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(payload?.detail ?? payload?.error ?? `Upload failed (${request.status}).`));
        return;
      }
      resolve(payload as T);
    };
    request.send(body);
  });
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/v1${path}`, { ...init, headers });
  } catch {
    throw new Error(`Cannot reach the EDUPULSE backend at ${API_BASE_URL}. Start the FastAPI server and try again.`);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string; error?: string } | null;
    throw new Error(payload?.detail ?? payload?.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function getHealth<T = { status: string; service: string }>(): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) throw new Error("API is unavailable");
  return response.json() as Promise<T>;
}

export async function getAIHealth<T>(): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/ai/health`);
  if (!response.ok) throw new Error("AI health service is unavailable");
  return response.json();
}
