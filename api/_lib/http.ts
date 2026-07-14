import type { ZodError } from "zod"

export function errorResponse(message: string, status: number, details?: unknown) {
  return Response.json(
    {
      status: "error",
      message,
      ...(details ? { details } : {}),
    },
    { status },
  )
}

export function validationErrorResponse(error: ZodError) {
  const fields = Object.fromEntries(
    error.issues.map((issue) => [issue.path.join("."), issue.message]),
  )

  return errorResponse("Revise os campos informados.", 400, fields)
}

export async function readRequestBody(request: Request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}
