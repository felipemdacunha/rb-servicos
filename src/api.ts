import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DEFAULT_SETTINGS, type Order, type Settings, type User } from "@shared/domain";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T = unknown>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Sem conexão. Verifique a internet e tente de novo.", 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error ?? "Não foi possível completar a operação.", response.status);
  return data as T;
}

export const useSession = () =>
  useQuery({ queryKey: ["session"], queryFn: () => api<{ user: User | null; needsSetup: boolean }>("GET", "/auth/me"), staleTime: Infinity });

export function useSettings(): Settings {
  return useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("GET", "/settings"), staleTime: 60_000 }).data ?? DEFAULT_SETTINGS;
}

export const useOrders = (month: string) =>
  useQuery({ queryKey: ["orders", month], queryFn: () => api<Order[]>("GET", `/orders?month=${month}`) });

export const useCities = () =>
  useQuery({ queryKey: ["cities"], queryFn: () => api<Array<{ city: string; km: number }>>("GET", "/cities"), staleTime: 60_000 }).data ?? [];

/** Mutação padrão: mostra erro, recarrega os dados e volta ao login se a sessão expirou. */
export function useAction<TInput, TResult = unknown>(run: (input: TInput) => Promise<TResult>, success?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all(["orders", "cities", "settings"].map(key => client.invalidateQueries({ queryKey: [key] })));
      if (success) toast.success(success);
    },
    onError: error => {
      if (error instanceof ApiError && error.status === 401) void client.invalidateQueries({ queryKey: ["session"] });
      toast.error(error.message);
    },
  });
}

export async function logout() {
  await api("POST", "/auth/logout", {}).catch(() => undefined);
  window.location.replace("/");
}
