type ApiErrorPayload = {
  message?: string
  details?: Record<string, string>
}

export class ApiClientError extends Error {
  details?: Record<string, string>

  constructor(message: string, details?: Record<string, string>) {
    super(message)
    this.name = "ApiClientError"
    this.details = details
  }
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })

  let payload: unknown

  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const errorPayload = (payload ?? {}) as ApiErrorPayload
    throw new ApiClientError(
      errorPayload.message ?? "Não foi possível concluir a solicitação.",
      errorPayload.details,
    )
  }

  if (payload === null) {
    throw new ApiClientError("A API retornou uma resposta inválida.")
  }

  return payload as T
}
