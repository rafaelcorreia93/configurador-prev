import { z } from "zod"

import {
  calculateInvestment,
  InvestmentApiError,
} from "./_lib/investment-api.js"
import { errorResponse, readRequestBody, validationErrorResponse } from "./_lib/http.js"

const isoDate = /^\d{4}-\d{2}-\d{2}$/

function isValidIsoDate(value: string) {
  if (!isoDate.test(value)) return false

  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const investmentCalculationSchema = z.object({
  vp: z.number().min(0).default(0),
  basicaParticipante: z.number().min(0),
  basicaEmpresa: z.number().min(0),
  voluntariaParticipante: z.number().min(0).default(0),
  voluntariaEmpresa: z.number().min(0).default(0),
  r_anual: z.number().min(0),
  dataInicio: z.string().refine(isValidIsoDate, "Use uma data válida no formato AAAA-MM-DD."),
  dataFim: z.string().refine(isValidIsoDate, "Use uma data válida no formato AAAA-MM-DD."),
  pmt_extra: z.number().min(0).default(0),
  freq_extra: z.literal("12 meses").default("12 meses"),
  considerar_decimo: z.boolean(),
}).strict().refine(
  ({ dataInicio, dataFim }) => dataFim >= dataInicio,
  { path: ["dataFim"], message: "A data final deve ser igual ou posterior à data inicial." },
)

export async function POST(request: Request) {
  const body = await readRequestBody(request)
  const parsed = investmentCalculationSchema.safeParse(body)

  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  try {
    const result = await calculateInvestment(parsed.data)
    return Response.json(result)
  } catch (error) {
    if (error instanceof InvestmentApiError) {
      return errorResponse(error.message, error.status, { codigo: error.code })
    }

    console.error("Falha inesperada ao calcular investimento", error)
    return errorResponse("Não foi possível calcular o investimento.", 500)
  }
}
