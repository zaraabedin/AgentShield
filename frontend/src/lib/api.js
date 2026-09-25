const API_URL = "/svc/api";

function apiTarget() {
  return API_URL || window.location.origin;
}

function errorFromResponse(path, response, data) {
  const target = `${apiTarget()}${path}`;
  if (response.status === 404) {
    return (
      `${path} was not found at ${apiTarget()}. ` +
      "Set VITE_API_URL to the FastAPI host " +
      "(python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000), " +
      "not the Vercel dashboard URL."
    );
  }
  const detail = data?.detail || data?.message;
  if (typeof detail === "string" && detail.trim()) {
    if (/not found/i.test(detail)) {
      return `${path} was not found at ${apiTarget()}. ${detail}`;
    }
    return detail;
  }
  if (detail && typeof detail === "object") {
    return JSON.stringify(detail);
  }
  return `HTTP ${response.status} from ${target}`;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      },
      ...options
    });
  } catch {
    throw new Error(
      `Cannot reach AgentShield API at ${apiTarget()}. ` +
        "Start FastAPI on that host, or set VITE_API_URL to a public API URL."
    );
  }

  let data = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new Error(errorFromResponse(path, response, data));
  }

  return data;
}

export function getApiUrl() {
  return API_URL;
}

export function getHealth() {
  return request("/health");
}

export function getPaymentStatus() {
  return request("/payment/status");
}

export function getProviders() {
  return request("/providers");
}

export function getTransactions() {
  return request("/transactions");
}

export function preparePayment(payer) {
  return request("/payment/prepare", {
    method: "POST",
    body: JSON.stringify({ payer })
  });
}

export function analyzeProvider(payload) {
  return request("/analyze", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function authorizeTransaction(payload) {
  return request("/authorize", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
