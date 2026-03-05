/**
 * Centralized API Client
 *
 * Single source of truth for API configuration and base fetch utilities.
 * Automatically attaches JWT Authorization header when a token exists.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? '' : 'http://127.0.0.1:8000');
export const API_BASE = `${API_URL}/api/v1`;

/**
 * Get the stored auth token (client-side only).
 */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('auth_token');
}

/**
 * Build headers with optional Authorization.
 */
function buildHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Merge extra headers
  if (extra) {
    if (extra instanceof Headers) {
      extra.forEach((value, key) => { headers[key] = value; });
    } else if (Array.isArray(extra)) {
      extra.forEach(([key, value]) => { headers[key] = value; });
    } else {
      Object.assign(headers, extra);
    }
  }
  return headers;
}

/**
 * Returns "; Secure" when page is served over HTTPS, empty string otherwise.
 * Prevents Secure-flag cookies from being blocked in local HTTP dev.
 */
function secureCookieFlag(): string {
  return typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
}

/**
 * Standard fetch wrapper with common error handling.
 * Automatically attaches JWT token and handles 401 redirects.
 */
export async function apiFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(options?.headers),
  });

  // Auto-redirect to login on 401 (token expired or invalid)
  // But don't redirect if already on the login page (prevents loop)
  if (response.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_email');
    const secure = secureCookieFlag();
    document.cookie = `auth_token=; path=/; max-age=0; SameSite=Lax${secure}`;
    document.cookie = `user_role=; path=/; max-age=0; SameSite=Lax${secure}`;
    window.location.href = '/login';
  }

  return response;
}

/**
 * POST request with JSON body.
 */
export async function apiPost<T>(endpoint: string, body: T): Promise<Response> {
  return apiFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * PATCH request with JSON body.
 */
export async function apiPatch<T>(endpoint: string, body: T): Promise<Response> {
  return apiFetch(endpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * PUT request with JSON body.
 */
export async function apiPut<T>(endpoint: string, body: T): Promise<Response> {
  return apiFetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * DELETE request.
 */
export async function apiDelete(endpoint: string): Promise<Response> {
  return apiFetch(endpoint, { method: 'DELETE' });
}

/**
 * Builds the full upload URL for file uploads.
 */
export function getUploadUrl(asMaster = false): string {
  const params = new URLSearchParams();
  if (asMaster) {
    params.set('as_master', 'true');
  }
  const query = params.toString();
  return query ? `${API_BASE}/resumes/upload?${query}` : `${API_BASE}/resumes/upload`;
}

// ---------------------------------------------------------------------------
// Maintenance Status
// ---------------------------------------------------------------------------

export interface MaintenanceStatus {
  maintenance_enabled: boolean;
  maintenance_message: string;
}

/**
 * Fetch the current maintenance notice from the public endpoint.
 * Never throws — returns safe defaults on any error so callers can fire-and-forget.
 */
export async function fetchMaintenanceStatus(): Promise<MaintenanceStatus> {
  try {
    const res = await fetch(`${API_BASE}/maintenance-status`);
    if (!res.ok) return { maintenance_enabled: false, maintenance_message: '' };
    return (await res.json()) as MaintenanceStatus;
  } catch {
    return { maintenance_enabled: false, maintenance_message: '' };
  }
}

/**
 * Check if user is authenticated (client-side only).
 */
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

/**
 * Logout: clear credentials and redirect to login.
 */
export function logout(): void {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_role');
  localStorage.removeItem('user_email');
  // Clear middleware cookies (add Secure flag on HTTPS)
  const secure = secureCookieFlag();
  document.cookie = `auth_token=; path=/; max-age=0; SameSite=Lax${secure}`;
  document.cookie = `user_role=; path=/; max-age=0; SameSite=Lax${secure}`;
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}
