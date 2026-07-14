import { useEffect, useState, type FormEvent } from "react"
import { CircleAlert, FileText, LoaderCircle, Plus, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiRequest, ApiClientError } from "@/lib/api"
import {
  formatDraftNumber,
  MODEL_LABELS,
  MODEL_OPTIONS,
  parseLocalizedNumber,
} from "@/lib/contribution-rules"
import type {
  ConfiguracaoContribuicao,
  ConfiguracoesResponse,
  ModeloContribuicao,
  Plano,
  RegraFaixa,
} from "@/types/api"

type ConfigurationDialogProps = {
  plano: Plano | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}

type RuleDraft = {
  key: string
  limiteInferior: string
  limiteSuperior: string
  minPercentual: string
  maxPercentual: string
  percentualFixo: string
  descricao: string
}

type ConfigurationDraft = {
  tipo: string
  modelo: ModeloContribuicao
  variavelReferencia: string
  numParcelasAnuais: string
  proporcaoPatrocinador: string
  limiteMaximoPatrocinador: string
  regras: RuleDraft[]
}

type EditorStatus = "loading" | "ready" | "error"

export function ConfigurationDialog({
  plano,
  open,
  onOpenChange,
  onSaved,
}: ConfigurationDialogProps) {
  const [status, setStatus] = useState<EditorStatus>("loading")
  const [configuracoes, setConfiguracoes] = useState<ConfiguracaoContribuicao[]>([])
  const [selectedConfigurationId, setSelectedConfigurationId] = useState("new")
  const [form, setForm] = useState<ConfigurationDraft>(() => createBlankConfiguration(null))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !plano) return

    const controller = new AbortController()
    void Promise.resolve().then(() => loadConfigurations(plano, controller.signal))
    return () => controller.abort()
  }, [open, plano])

  async function loadConfigurations(currentPlan: Plano, signal?: AbortSignal) {
    setStatus("loading")
    setLoadError(null)

    try {
      const response = await apiRequest<ConfiguracoesResponse>(
        `/api/configuracoes-contribuicao?planoId=${encodeURIComponent(currentPlan.id)}`,
        { signal },
      )
      setConfiguracoes(response.data)

      if (response.data.length > 0) {
        setSelectedConfigurationId(response.data[0].id)
        setForm(configurationToDraft(response.data[0]))
      } else {
        setSelectedConfigurationId("new")
        setForm(createBlankConfiguration(currentPlan))
      }

      setStatus("ready")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar as regras.")
      setStatus("error")
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setFormError(null)
      setLoadError(null)
    }
    onOpenChange(nextOpen)
  }

  function handleConfigurationSelection(configurationId: string) {
    setSelectedConfigurationId(configurationId)
    setFormError(null)

    if (configurationId === "new") {
      setForm(createBlankConfiguration(plano, configuracoes.length > 0 ? "" : "principal"))
      return
    }

    const configuration = configuracoes.find((item) => item.id === configurationId)
    if (configuration) setForm(configurationToDraft(configuration))
  }

  function handleModelChange(modelo: ModeloContribuicao) {
    setForm((current) => ({
      ...current,
      modelo,
      variavelReferencia:
        modelo === "idade_tempo_servico"
          ? "idade_tempo_servico"
          : current.variavelReferencia === "idade_tempo_servico"
            ? plano?.unidadeReferencia?.sigla ?? "SRC"
            : current.variavelReferencia,
    }))
  }

  function updateRule(index: number, field: keyof RuleDraft, value: string) {
    setForm((current) => ({
      ...current,
      regras: current.regras.map((rule, ruleIndex) =>
        ruleIndex === index ? { ...rule, [field]: value } : rule,
      ),
    }))
  }

  function addRule() {
    setForm((current) => {
      const lastRule = current.regras.at(-1)
      return {
        ...current,
        regras: [...current.regras, createBlankRule(lastRule?.limiteSuperior ?? "")],
      }
    })
  }

  function removeRule(index: number) {
    setForm((current) => ({
      ...current,
      regras: current.regras.filter((_, ruleIndex) => ruleIndex !== index),
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!plano) return

    setFormError(null)

    try {
      const payload = draftToPayload(form, plano.id)
      setIsSubmitting(true)
      await apiRequest("/api/configuracoes-contribuicao", {
        method: "POST",
        body: JSON.stringify(payload),
      })
      await onSaved()
      handleOpenChange(false)
    } catch (error) {
      if (error instanceof ApiClientError) {
        const fieldMessage = error.details ? Object.values(error.details)[0] : null
        setFormError(fieldMessage ?? error.message)
      } else {
        setFormError(error instanceof Error ? error.message : "Não foi possível salvar a configuração.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const currentModel = MODEL_OPTIONS.find((option) => option.value === form.modelo)!
  const isEditing = selectedConfigurationId !== "new"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Configurar regras — {plano?.sigla}</DialogTitle>
          <DialogDescription>
            Defina o modelo de cálculo, a contrapartida do patrocinador e as faixas aplicáveis ao plano.
          </DialogDescription>
        </DialogHeader>

        {status === "loading" && (
          <div className="flex min-h-80 items-center justify-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            Carregando configurações...
          </div>
        )}

        {status === "error" && (
          <div className="flex min-h-72 flex-col items-center justify-center text-center">
            <CircleAlert className="mb-4 size-8 text-error" aria-hidden="true" />
            <p className="font-heading text-lg font-semibold text-foreground">Não foi possível abrir o editor</p>
            <p className="mt-2 max-w-md text-sm text-error">{loadError}</p>
            {plano && (
              <Button className="mt-5" variant="outline" onClick={() => void loadConfigurations(plano)}>
                Tentar novamente
              </Button>
            )}
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit}>
            {configuracoes.length > 0 && (
              <div className="mb-6 flex flex-col gap-3 rounded-[var(--vivest-radius-3)] border border-border bg-action-soft p-4 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="savedConfiguration">Configuração</Label>
                  <select
                    id="savedConfiguration"
                    value={selectedConfigurationId}
                    onChange={(event) => handleConfigurationSelection(event.target.value)}
                    className={selectClassName}
                  >
                    {configuracoes.map((configuration) => (
                      <option key={configuration.id} value={configuration.id}>
                        {configuration.tipo} — {MODEL_LABELS[configuration.modelo]}
                      </option>
                    ))}
                    <option value="new">Nova configuração</option>
                  </select>
                </div>
                <Button type="button" variant="outline" onClick={() => handleConfigurationSelection("new")}>
                  <Plus className="size-4" aria-hidden="true" />
                  Nova configuração
                </Button>
              </div>
            )}

            <div className="grid gap-7 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-7">
                <section>
                  <h3 className="mb-4 font-heading text-lg font-semibold text-foreground">Dados da contribuição</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Tipo da contribuição" htmlFor="contributionType" hint="Ex.: principal, adicional ou voluntária">
                      <Input
                        id="contributionType"
                        value={form.tipo}
                        onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value }))}
                        placeholder="principal"
                        disabled={isEditing}
                        required
                      />
                    </Field>

                    <Field label="Modelo" htmlFor="model">
                      <select
                        id="model"
                        value={form.modelo}
                        onChange={(event) => handleModelChange(event.target.value as ModeloContribuicao)}
                        className={selectClassName}
                      >
                        {MODEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Variável de referência" htmlFor="referenceVariable">
                      <select
                        id="referenceVariable"
                        value={form.variavelReferencia}
                        onChange={(event) => setForm((current) => ({ ...current, variavelReferencia: event.target.value }))}
                        className={selectClassName}
                        disabled={form.modelo === "idade_tempo_servico"}
                      >
                        <option value="SRC">SRC — Salário Real de Contribuição</option>
                        {plano?.unidadeReferencia && (
                          <option value={plano.unidadeReferencia.sigla}>{plano.unidadeReferencia.sigla} — Unidade do plano</option>
                        )}
                        <option value="idade_tempo_servico">Idade + tempo de serviço</option>
                      </select>
                    </Field>

                    <Field label="Parcelas anuais" htmlFor="annualInstallments">
                      <Input
                        id="annualInstallments"
                        type="number"
                        min="1"
                        max="24"
                        value={form.numParcelasAnuais}
                        onChange={(event) => setForm((current) => ({ ...current, numParcelasAnuais: event.target.value }))}
                        required
                      />
                    </Field>

                    <Field label="Proporção do patrocinador" htmlFor="sponsorRatio" hint="1 significa 100% da contribuição do participante">
                      <Input
                        id="sponsorRatio"
                        value={form.proporcaoPatrocinador}
                        onChange={(event) => setForm((current) => ({ ...current, proporcaoPatrocinador: event.target.value }))}
                        inputMode="decimal"
                        placeholder="1"
                        required
                      />
                    </Field>

                    <Field label="Teto do patrocinador sobre o SRC (%)" htmlFor="sponsorLimit" hint="Deixe vazio quando não houver teto">
                      <Input
                        id="sponsorLimit"
                        value={form.limiteMaximoPatrocinador}
                        onChange={(event) => setForm((current) => ({ ...current, limiteMaximoPatrocinador: event.target.value }))}
                        inputMode="decimal"
                        placeholder="10"
                      />
                    </Field>
                  </div>
                  <p className="mt-4 rounded-[var(--vivest-radius-2)] bg-action-soft px-4 py-3 text-sm leading-6 text-muted-foreground">
                    <strong className="text-foreground">{currentModel.label}:</strong> {currentModel.description}
                  </p>
                </section>

                <section>
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-heading text-lg font-semibold text-foreground">Faixas da regra</h3>
                      <p className="mt-1 text-sm text-muted-foreground">A ordem abaixo será usada no cálculo.</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={addRule}>
                      <Plus className="size-4" aria-hidden="true" />
                      Adicionar faixa
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {form.regras.map((rule, index) => (
                      <RuleFields
                        key={rule.key}
                        index={index}
                        rule={rule}
                        model={form.modelo}
                        reference={form.variavelReferencia}
                        canRemove={form.regras.length > 1}
                        onChange={updateRule}
                        onRemove={removeRule}
                      />
                    ))}
                  </div>
                </section>
              </div>

              <RuleSummary form={form} />
            </div>

            {formError && (
              <p className="mt-6 flex items-start gap-2 rounded-[var(--vivest-radius-2)] bg-error-soft px-4 py-3 text-sm leading-6 text-error" role="alert">
                <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
                {formError}
              </p>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isSubmitting}>Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                {isSubmitting ? "Salvando..." : "Salvar configuração"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RuleFields({
  index,
  rule,
  model,
  reference,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number
  rule: RuleDraft
  model: ModeloContribuicao
  reference: string
  canRemove: boolean
  onChange: (index: number, field: keyof RuleDraft, value: string) => void
  onRemove: (index: number) => void
}) {
  const biometric = model === "idade_tempo_servico"

  return (
    <div className="rounded-[var(--vivest-radius-3)] border border-border p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="font-heading text-sm font-semibold text-foreground">Faixa {index + 1}</p>
        <Button type="button" size="icon" variant="ghost" onClick={() => onRemove(index)} disabled={!canRemove} aria-label={`Remover faixa ${index + 1}`}>
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={biometric ? "Soma mínima" : `Limite inferior (${reference})`} htmlFor={`lower-${rule.key}`}>
          <Input id={`lower-${rule.key}`} value={rule.limiteInferior} onChange={(event) => onChange(index, "limiteInferior", event.target.value)} inputMode="decimal" required />
        </Field>
        <Field label={biometric ? "Soma máxima" : `Limite superior (${reference})`} htmlFor={`upper-${rule.key}`} hint="Vazio significa sem limite">
          <Input id={`upper-${rule.key}`} value={rule.limiteSuperior} onChange={(event) => onChange(index, "limiteSuperior", event.target.value)} inputMode="decimal" />
        </Field>

        {(model === "percentual_livre" || model === "multiplicador_formula") && (
          <>
            <Field label={model === "multiplicador_formula" ? "Fator mínimo" : "Percentual mínimo (%)"} htmlFor={`min-${rule.key}`}>
              <Input id={`min-${rule.key}`} value={rule.minPercentual} onChange={(event) => onChange(index, "minPercentual", event.target.value)} inputMode="decimal" required />
            </Field>
            <Field label={model === "multiplicador_formula" ? "Fator máximo" : "Percentual máximo (%)"} htmlFor={`max-${rule.key}`}>
              <Input id={`max-${rule.key}`} value={rule.maxPercentual} onChange={(event) => onChange(index, "maxPercentual", event.target.value)} inputMode="decimal" required />
            </Field>
          </>
        )}

        {model !== "percentual_livre" && (
          <Field label={model === "multiplicador_formula" ? "Percentual base (%)" : "Percentual fixo (%)"} htmlFor={`fixed-${rule.key}`}>
            <Input id={`fixed-${rule.key}`} value={rule.percentualFixo} onChange={(event) => onChange(index, "percentualFixo", event.target.value)} inputMode="decimal" required />
          </Field>
        )}

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`description-${rule.key}`}>Descrição opcional</Label>
          <textarea
            id={`description-${rule.key}`}
            value={rule.descricao}
            onChange={(event) => onChange(index, "descricao", event.target.value)}
            className="min-h-20 w-full resize-y rounded-[var(--vivest-radius-2)] border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            maxLength={500}
          />
        </div>
      </div>
    </div>
  )
}

function RuleSummary({ form }: { form: ConfigurationDraft }) {
  return (
    <aside className="h-fit rounded-[var(--vivest-radius-3)] border border-border bg-action-soft p-5 lg:sticky lg:top-0">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-[var(--vivest-radius-full)] bg-card text-action">
          <FileText className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">Resumo da regra</h3>
          <p className="text-xs text-muted-foreground">Prévia gerada automaticamente</p>
        </div>
      </div>

      <div className="space-y-3">
        {form.regras.map((rule, index) => (
          <p key={rule.key} className="rounded-[var(--vivest-radius-2)] bg-card px-4 py-3 text-sm leading-7 text-muted-foreground">
            <strong className="text-foreground">Faixa {index + 1}:</strong>{" "}
            {summarizeRule(rule, form.modelo, form.variavelReferencia)}
          </p>
        ))}
      </div>

      <p className="mt-4 border-t border-border pt-4 text-sm leading-7 text-muted-foreground">
        O patrocinador contribui na proporção de <strong className="text-foreground">{formatDraftNumber(form.proporcaoPatrocinador)}</strong> sobre a contribuição do participante
        {form.limiteMaximoPatrocinador.trim()
          ? <> e respeita o teto de <strong className="text-foreground">{formatDraftNumber(form.limiteMaximoPatrocinador)}% do SRC</strong>.</>
          : "."}
      </p>
    </aside>
  )
}

function summarizeRule(rule: RuleDraft, model: ModeloContribuicao, reference: string) {
  const lower = formatDraftNumber(rule.limiteInferior)
  const hasUpperLimit = Boolean(rule.limiteSuperior.trim())
  const upper = formatDraftNumber(rule.limiteSuperior)

  if (model === "idade_tempo_servico") {
    const biometricRange = hasUpperLimit
      ? `entre ${lower} e ${upper}`
      : `a partir de ${lower}, sem limite superior`
    return `quando idade + tempo de serviço estiver ${biometricRange}, o percentual será ${formatDraftNumber(rule.percentualFixo)}%.`
  }

  const range = hasUpperLimit
    ? `para a faixa entre ${lower} e ${upper} ${reference}`
    : `para valores a partir de ${lower} ${reference}, sem limite superior`

  if (model === "percentual_livre") {
    return `${range}, o participante poderá escolher entre ${formatDraftNumber(rule.minPercentual)}% e ${formatDraftNumber(rule.maxPercentual)}%.`
  }

  if (model === "fatias_aditivas") {
    return `${range}, incidirá ${formatDraftNumber(rule.percentualFixo)}% somente sobre a parcela compreendida nessa faixa.`
  }

  return `${range}, o percentual base de ${formatDraftNumber(rule.percentualFixo)}% será multiplicado por um fator entre ${formatDraftNumber(rule.minPercentual)} e ${formatDraftNumber(rule.maxPercentual)}.`
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  )
}

function createBlankConfiguration(plano: Plano | null, tipo = "principal"): ConfigurationDraft {
  return {
    tipo,
    modelo: "percentual_livre",
    variavelReferencia: plano?.unidadeReferencia?.sigla ?? "SRC",
    numParcelasAnuais: "12",
    proporcaoPatrocinador: "1",
    limiteMaximoPatrocinador: "",
    regras: [createBlankRule("0")],
  }
}

function createBlankRule(limiteInferior: string): RuleDraft {
  return {
    key: crypto.randomUUID(),
    limiteInferior,
    limiteSuperior: "",
    minPercentual: "",
    maxPercentual: "",
    percentualFixo: "",
    descricao: "",
  }
}

function configurationToDraft(configuration: ConfiguracaoContribuicao): ConfigurationDraft {
  return {
    tipo: configuration.tipo,
    modelo: configuration.modelo,
    variavelReferencia: configuration.variavelReferencia,
    numParcelasAnuais: String(configuration.numParcelasAnuais),
    proporcaoPatrocinador: String(configuration.proporcaoPatrocinador),
    limiteMaximoPatrocinador: numberToDraft(configuration.limiteMaximoPatrocinador),
    regras: configuration.regras.map(ruleToDraft),
  }
}

function ruleToDraft(rule: RegraFaixa): RuleDraft {
  return {
    key: rule.id || crypto.randomUUID(),
    limiteInferior: String(rule.limiteInferior),
    limiteSuperior: numberToDraft(rule.limiteSuperior),
    minPercentual: numberToDraft(rule.minPercentual),
    maxPercentual: numberToDraft(rule.maxPercentual),
    percentualFixo: numberToDraft(rule.percentualFixo),
    descricao: rule.descricao ?? "",
  }
}

function numberToDraft(value: number | null) {
  return value === null ? "" : String(value)
}

function draftToPayload(form: ConfigurationDraft, planoId: string) {
  if (!form.tipo.trim()) throw new Error("Informe o tipo da contribuição.")

  const numParcelasAnuais = requiredNumber(form.numParcelasAnuais, "parcelas anuais")
  const proporcaoPatrocinador = requiredNumber(form.proporcaoPatrocinador, "proporção do patrocinador")

  return {
    planoId,
    tipo: form.tipo.trim(),
    modelo: form.modelo,
    variavelReferencia: form.variavelReferencia,
    numParcelasAnuais,
    proporcaoPatrocinador,
    limiteMaximoPatrocinador: optionalNumber(form.limiteMaximoPatrocinador),
    regras: form.regras.map((rule, index) => ({
      limiteInferior: requiredNumber(rule.limiteInferior, `limite inferior da faixa ${index + 1}`),
      limiteSuperior: optionalNumber(rule.limiteSuperior),
      minPercentual:
        form.modelo === "percentual_livre" || form.modelo === "multiplicador_formula"
          ? requiredNumber(rule.minPercentual, `valor mínimo da faixa ${index + 1}`)
          : null,
      maxPercentual:
        form.modelo === "percentual_livre" || form.modelo === "multiplicador_formula"
          ? requiredNumber(rule.maxPercentual, `valor máximo da faixa ${index + 1}`)
          : null,
      percentualFixo:
        form.modelo === "percentual_livre"
          ? null
          : requiredNumber(rule.percentualFixo, `percentual da faixa ${index + 1}`),
      descricao: rule.descricao.trim() || null,
    })),
  }
}

function requiredNumber(value: string, label: string) {
  const number = parseLocalizedNumber(value)
  if (number === null) throw new Error(`Informe um valor válido para ${label}.`)
  return number
}

function optionalNumber(value: string) {
  if (!value.trim()) return null
  const number = parseLocalizedNumber(value)
  if (number === null) throw new Error("Revise os valores numéricos informados.")
  return number
}

const selectClassName =
  "flex h-11 w-full rounded-[var(--vivest-radius-2)] border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70"
