import type { ModeloContribuicao } from "@/types/api"

export const MODEL_OPTIONS: Array<{
  value: ModeloContribuicao
  label: string
  description: string
}> = [
  {
    value: "percentual_livre",
    label: "Percentual livre",
    description: "O participante escolhe um percentual dentro dos limites da faixa.",
  },
  {
    value: "fatias_aditivas",
    label: "Fatias aditivas",
    description: "Cada percentual incide somente sobre a parcela compreendida em sua faixa.",
  },
  {
    value: "idade_tempo_servico",
    label: "Idade + tempo de serviço",
    description: "O percentual é determinado pela soma da idade com o tempo de serviço.",
  },
  {
    value: "multiplicador_formula",
    label: "Multiplicador de fórmula",
    description: "Um percentual-base é multiplicado por um fator escolhido dentro da faixa.",
  },
]

export const MODEL_LABELS = Object.fromEntries(
  MODEL_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ModeloContribuicao, string>

export function parseLocalizedNumber(value: string) {
  const trimmedValue = value.trim()

  if (!trimmedValue) return null

  const normalizedValue = trimmedValue.includes(",")
    ? trimmedValue.replace(/\./g, "").replace(",", ".")
    : trimmedValue
  const parsedValue = Number(normalizedValue)

  return Number.isFinite(parsedValue) ? parsedValue : null
}

export function formatDraftNumber(value: string) {
  const parsedValue = parseLocalizedNumber(value)
  if (parsedValue === null) return "—"
  return parsedValue.toLocaleString("pt-BR", { maximumFractionDigits: 6 })
}
