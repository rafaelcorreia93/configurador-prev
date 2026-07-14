import type { ModalidadeRenda, TipoAposentadoria } from "@/types/api"

export const RETIREMENT_OPTIONS: Array<{ value: TipoAposentadoria; label: string }> = [
  { value: "normal", label: "Aposentadoria normal" },
  { value: "antecipada", label: "Aposentadoria antecipada" },
  { value: "proporcional", label: "Aposentadoria proporcional" },
]

export const INCOME_OPTIONS: Array<{
  value: ModalidadeRenda
  label: string
  description: string
}> = [
  {
    value: "percentual_saldo",
    label: "Percentual do saldo",
    description: "Renda mensal calculada como percentual do saldo remanescente.",
  },
  {
    value: "prazo_determinado",
    label: "Prazo determinado",
    description: "Saldo distribuído durante um intervalo de meses escolhido.",
  },
  {
    value: "valor_fixo",
    label: "Valor fixo",
    description: "Participante escolhe um valor monetário mensal.",
  },
]

export const RETIREMENT_LABELS = Object.fromEntries(
  RETIREMENT_OPTIONS.map((option) => [option.value, option.label]),
) as Record<TipoAposentadoria, string>

export const INCOME_LABELS = Object.fromEntries(
  INCOME_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ModalidadeRenda, string>
