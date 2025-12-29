import { QueryClient, QueryFunction } from "@tanstack/react-query";

let csrfTokenCache: string | null = null;

// Экспортируем функцию для установки токена извне (например, из App.tsx)
export function setCSRFToken(token: string | null) {
  csrfTokenCache = token;
}

async function getCSRFToken(): Promise<string | null> {
  if (csrfTokenCache) {
    return csrfTokenCache;
  }

  try {
    // Создаем AbortController для таймаута (совместимо со всеми браузерами)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // Уменьшаем таймаут до 3 секунд

    const response = await fetch("/api/auth/me", { 
      credentials: "include",
      signal: controller.signal,
    }).catch((fetchError) => {
      // Обрабатываем ошибку fetch отдельно
      clearTimeout(timeoutId);
      throw fetchError;
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      csrfTokenCache = data.csrfToken || null;
      return csrfTokenCache;
    } else if (response.status === 401) {
      // Пользователь не авторизован - это нормально, вернем null
      return null;
    }
  } catch (error) {
    // Тихая обработка ошибок - не логируем, просто возвращаем null
    // Это нормальная ситуация, если сервер недоступен или есть проблемы с сетью
    // Запрос продолжится без CSRF токена, и сервер вернет понятную ошибку, если токен обязателен
    return null;
  }
  return null;
}

export function clearCSRFTokenCache() {
  csrfTokenCache = null;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const needsCSRF = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }

  if (needsCSRF) {
    // Пытаемся получить CSRF токен, но не блокируем запрос при ошибке
    const token = await getCSRFToken().catch(() => null);
    if (token) {
      headers["X-CSRF-Token"] = token;
    }
    // Если токен не получен, продолжаем без него
    // Сервер вернет понятную ошибку (403 или 400), если токен обязателен
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
