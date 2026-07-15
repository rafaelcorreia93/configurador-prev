import { z } from "zod"

const AUTH_URL = "https://homologacao.vivest.com.br/apis/api-vivest-auth/v1/Auth/login"
const CALCULATION_URL = "https://homologacao.vivest.com.br/apis/api-vivestone-bff/api/v1/previdencia/calcular-investimento"

const authResponseSchema = z.object({
  accessToken: z.string().min(1),
}).passthrough()

const investmentCalculationResponseSchema = z.object({
  success: z.boolean(),
  valorFuturoTotal: z.number(),
  detalhes: z.object({
    vfAporteInicial: z.number(),
    vfBasicaParticipante: z.number(),
    vfBasicaEmpresa: z.number(),
    vfVoluntariaParticipante: z.number(),
    vfVoluntariaEmpresa: z.number(),
    vfAportesExtrasOpcionais: z.number(),
  }),
  totaisAportes: z.object({
    aporteInicial: z.number(),
    totalBasicaParticipante: z.number(),
    totalBasicaEmpresa: z.number(),
    totalVoluntariaParticipante: z.number(),
    totalVoluntariaEmpresa: z.number(),
    totalAportesExtrasOpcionais: z.number(),
    totalAportadoSemRentabilidade: z.number(),
  }),
  rentabilidade: z.object({
    valorRendimento: z.number(),
    percentualSobreAportado: z.number(),
  }),
  parametrosEntrada: z.object({
    vp: z.number(),
    basicaParticipante: z.number(),
    basicaEmpresa: z.number(),
    voluntariaParticipante: z.number(),
    voluntariaEmpresa: z.number(),
    r_anual: z.number(),
    dataInicio: z.string(),
    dataFim: z.string(),
    pmt_extra: z.number(),
    freq_extra: z.string(),
    considerar_decimo: z.boolean(),
  }),
  periodosCalculados: z.object({
    anosCompletos: z.number(),
    mesesCompletos: z.number(),
    decimosAplicados: z.number(),
  }),
}).passthrough()

export type InvestmentCalculationResponse = z.infer<typeof investmentCalculationResponseSchema>

export class InvestmentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: "CONFIGURATION" | "AUTHENTICATION" | "CALCULATION" | "INVALID_RESPONSE",
  ) {
    super(message)
    this.name = "InvestmentApiError"
  }
}

type InvestmentCalculationInput = {
  vp: number
  basicaParticipante: number
  basicaEmpresa: number
  voluntariaParticipante: number
  voluntariaEmpresa: number
  r_anual: number
  dataInicio: string
  dataFim: string
  pmt_extra: number
  freq_extra: string
  considerar_decimo: boolean
}

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new InvestmentApiError(
      "A integração com a API de cálculo não está configurada.",
      500,
      "CONFIGURATION",
    )
  }

  return value
}

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function calculateInvestment(
  input: InvestmentCalculationInput,
): Promise<InvestmentCalculationResponse> {
  const cpf = requiredEnvironmentVariable("auth_api_cpf")
  const password = requiredEnvironmentVariable("auth_api_password")
  const subscriptionKey = requiredEnvironmentVariable("OCP_API_CALCULO")
  const commonHeaders = {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": subscriptionKey,
  }

  let authResponse: Response

  try {
    authResponse = await fetch(AUTH_URL, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        cpf,
        password,
        deviceId: "APPLEDID-NEW-DELIA-1113",
        platform: "iOs",
        appVersion: "1.0.0",
      }),
    })
  } catch {
    throw new InvestmentApiError(
      "Não foi possível acessar a autenticação da Vivest.",
      502,
      "AUTHENTICATION",
    )
  }

  const authPayload = await readJson(authResponse)

  if (!authResponse.ok) {
    throw new InvestmentApiError(
      "A autenticação na API da Vivest foi recusada.",
      502,
      "AUTHENTICATION",
    )
  }

  const parsedAuth = authResponseSchema.safeParse(authPayload)

  if (!parsedAuth.success) {
    throw new InvestmentApiError(
      "A API de autenticação retornou uma resposta inválida.",
      502,
      "INVALID_RESPONSE",
    )
  }

  let calculationResponse: Response

  try {
    calculationResponse = await fetch(CALCULATION_URL, {
      method: "POST",
      headers: {
        ...commonHeaders,
        Authorization: `Bearer ${parsedAuth.data.accessToken}`,
      },
      body: JSON.stringify(input),
    })
  } catch {
    throw new InvestmentApiError(
      "Não foi possível acessar a API de cálculo da Vivest.",
      502,
      "CALCULATION",
    )
  }

  const calculationPayload = await readJson(calculationResponse)

  if (!calculationResponse.ok) {
    throw new InvestmentApiError(
      "A API da Vivest não conseguiu calcular o investimento.",
      502,
      "CALCULATION",
    )
  }

  const parsedCalculation = investmentCalculationResponseSchema.safeParse(calculationPayload)

  if (!parsedCalculation.success) {
    throw new InvestmentApiError(
      "A API de cálculo retornou uma resposta inválida.",
      502,
      "INVALID_RESPONSE",
    )
  }

  return parsedCalculation.data
}
