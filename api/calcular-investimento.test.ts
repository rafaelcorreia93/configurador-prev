import { afterEach, describe, expect, it, vi } from "vitest"

import { POST } from "./calcular-investimento.js"

function request(body: unknown) {
  return new Request("http://localhost/api/calcular-investimento", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function calculationResponse() {
  return {
    success: true,
    valorFuturoTotal: 299_604.44,
    detalhes: {
      vfAporteInicial: 48_010.21,
      vfBasicaParticipante: 125_797.12,
      vfBasicaEmpresa: 125_797.12,
      vfVoluntariaParticipante: 0,
      vfVoluntariaEmpresa: 0,
      vfAportesExtrasOpcionais: 0,
    },
    totaisAportes: {
      aporteInicial: 10_000,
      totalBasicaParticipante: 52_000,
      totalBasicaEmpresa: 52_000,
      totalVoluntariaParticipante: 0,
      totalVoluntariaEmpresa: 0,
      totalAportesExtrasOpcionais: 0,
      totalAportadoSemRentabilidade: 114_000,
    },
    rentabilidade: {
      valorRendimento: 185_604.44,
      percentualSobreAportado: 162.8109,
    },
    parametrosEntrada: {
      vp: 0,
      basicaParticipante: 100,
      basicaEmpresa: 100,
      voluntariaParticipante: 0,
      voluntariaEmpresa: 0,
      r_anual: 0.04,
      dataInicio: "2026-07-14",
      dataFim: "2066-07-14",
      pmt_extra: 0,
      freq_extra: "12 meses",
      considerar_decimo: true,
    },
    periodosCalculados: {
      anosCompletos: 40,
      mesesCompletos: 480,
      decimosAplicados: 40,
    },
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("POST /api/calcular-investimento", () => {
  it("autentica, aplica os padrões e retorna o cálculo da Vivest", async () => {
    vi.stubEnv("auth_api_cpf", "11111111111")
    vi.stubEnv("auth_api_password", "segredo")
    vi.stubEnv("OCP_API_CALCULO", "subscription-key")

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ accessToken: "access-token" }))
      .mockResolvedValueOnce(Response.json(calculationResponse()))
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(request({
      basicaParticipante: 100,
      basicaEmpresa: 100,
      r_anual: 0.04,
      dataInicio: "2026-07-14",
      dataFim: "2066-07-14",
      considerar_decimo: true,
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(calculationResponse())
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [authUrl, authOptions] = fetchMock.mock.calls[0]
    expect(authUrl).toContain("/api-vivest-auth/v1/Auth/login")
    expect(authOptions).toMatchObject({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": "subscription-key",
      },
    })
    expect(JSON.parse(authOptions.body)).toEqual({
      cpf: "11111111111",
      password: "segredo",
      deviceId: "APPLEDID-NEW-DELIA-1113",
      platform: "iOs",
      appVersion: "1.0.0",
    })

    const [calculationUrl, calculationOptions] = fetchMock.mock.calls[1]
    expect(calculationUrl).toContain("/calcular-investimento")
    expect(calculationOptions.headers).toMatchObject({
      Authorization: "Bearer access-token",
      "Ocp-Apim-Subscription-Key": "subscription-key",
    })
    expect(JSON.parse(calculationOptions.body)).toEqual({
      vp: 0,
      basicaParticipante: 100,
      basicaEmpresa: 100,
      voluntariaParticipante: 0,
      voluntariaEmpresa: 0,
      r_anual: 0.04,
      dataInicio: "2026-07-14",
      dataFim: "2066-07-14",
      pmt_extra: 0,
      freq_extra: "12 meses",
      considerar_decimo: true,
    })
  })

  it("não chama o cálculo quando a autenticação é recusada", async () => {
    vi.stubEnv("auth_api_cpf", "11111111111")
    vi.stubEnv("auth_api_password", "invalida")
    vi.stubEnv("OCP_API_CALCULO", "subscription-key")
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(request({
      basicaParticipante: 100,
      basicaEmpresa: 100,
      r_anual: 0.04,
      dataInicio: "2026-07-14",
      dataFim: "2066-07-14",
      considerar_decimo: true,
    }))

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({
      status: "error",
      details: { codigo: "AUTHENTICATION" },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("rejeita datas inválidas antes de acessar a Vivest", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await POST(request({
      basicaParticipante: 100,
      basicaEmpresa: 100,
      r_anual: 0.04,
      dataInicio: "2026-02-30",
      dataFim: "2025-07-14",
      considerar_decimo: true,
    }))

    expect(response.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
