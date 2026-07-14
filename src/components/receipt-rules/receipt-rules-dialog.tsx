import { useEffect, useState, type FormEvent } from "react"
import { CircleAlert, FileText, LoaderCircle, Save } from "lucide-react"

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
import { formatDraftNumber, parseLocalizedNumber } from "@/lib/contribution-rules"
import {
  INCOME_LABELS,
  INCOME_OPTIONS,
  RETIREMENT_LABELS,
  RETIREMENT_OPTIONS,
} from "@/lib/receipt-rules"
import type {
  ModalidadeRenda,
  PeriodicidadeRecalculo,
  Plano,
  RegrasRecebimento,
  RegrasRecebimentoResponse,
  TipoAposentadoria,
} from "@/types/api"

type ReceiptRulesDialogProps = {
  plano: Plano | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}

type RetirementDraft = {
  tipo: TipoAposentadoria
  enabled: boolean
  idadeMinima: string
  carenciaVinculacaoMeses: string
  exigeTerminoVinculo: boolean
  formulaMinimaCustomizada: string
}

type IncomeDraft = {
  modalidadeTipo: ModalidadeRenda
  enabled: boolean
  percentualRendaMin: string
  percentualRendaMax: string
  prazoMesesMin: string
  prazoMesesMax: string
}

type ReceiptDraft = {
  retirements: RetirementDraft[]
  permiteSaqueInicial: boolean
  percentualMaxSaque: string
  periodicidadeRecalculo: PeriodicidadeRecalculo
  incomes: IncomeDraft[]
  rendaMensalMinimaUnidade: string
  unidadeRendaMinima: string
  quitacaoSaldoResidualValor: string
  unidadeQuitacaoSaldo: string
}

type EditorStatus = "loading" | "ready" | "error"

export function ReceiptRulesDialog({
  plano,
  open,
  onOpenChange,
  onSaved,
}: ReceiptRulesDialogProps) {
  const [status, setStatus] = useState<EditorStatus>("loading")
  const [form, setForm] = useState<ReceiptDraft>(createBlankDraft)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open || !plano) return

    const controller = new AbortController()
    void Promise.resolve().then(() => loadRules(plano, controller.signal))
    return () => controller.abort()
  }, [open, plano])

  async function loadRules(currentPlan: Plano, signal?: AbortSignal) {
    setStatus("loading")
    setLoadError(null)
    setFormError(null)

    try {
      const response = await apiRequest<RegrasRecebimentoResponse>(
        `/api/regras-recebimento?planoId=${encodeURIComponent(currentPlan.id)}`,
        { signal },
      )
      setForm(rulesToDraft(response.data))
      setStatus("ready")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar as regras.")
      setStatus("error")
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setLoadError(null)
      setFormError(null)
    }
    onOpenChange(nextOpen)
  }

  function updateRetirement(type: TipoAposentadoria, patch: Partial<RetirementDraft>) {
    setForm((current) => ({
      ...current,
      retirements: current.retirements.map((item) =>
        item.tipo === type ? { ...item, ...patch } : item,
      ),
    }))
  }

  function updateIncome(type: ModalidadeRenda, patch: Partial<IncomeDraft>) {
    setForm((current) => ({
      ...current,
      incomes: current.incomes.map((item) =>
        item.modalidadeTipo === type ? { ...item, ...patch } : item,
      ),
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!plano) return

    setFormError(null)

    try {
      const payload = draftToPayload(form, plano.id)
      setIsSubmitting(true)
      await apiRequest("/api/regras-recebimento", {
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
        setFormError(error instanceof Error ? error.message : "Não foi possível salvar as regras.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>Regras de recebimento — {plano?.sigla}</DialogTitle>
          <DialogDescription>
            Configure a elegibilidade para aposentadoria e as formas disponíveis para recebimento do saldo.
          </DialogDescription>
        </DialogHeader>

        {status === "loading" && (
          <div className="flex min-h-80 items-center justify-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            Carregando regras de recebimento...
          </div>
        )}

        {status === "error" && (
          <div className="flex min-h-72 flex-col items-center justify-center text-center">
            <CircleAlert className="mb-4 size-8 text-error" aria-hidden="true" />
            <p className="font-heading text-lg font-semibold text-foreground">Não foi possível abrir o editor</p>
            <p className="mt-2 max-w-md text-sm text-error">{loadError}</p>
            {plano && (
              <Button className="mt-5" variant="outline" onClick={() => void loadRules(plano)}>
                Tentar novamente
              </Button>
            )}
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-7 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="space-y-8">
                <section>
                  <SectionTitle
                    title="Elegibilidade"
                    description="Ative os tipos previstos no regulamento e informe os requisitos mínimos."
                  />
                  <div className="space-y-4">
                    {form.retirements.map((retirement) => (
                      <div key={retirement.tipo} className="rounded-[var(--vivest-radius-3)] border border-border p-4">
                        <CheckboxRow
                          checked={retirement.enabled}
                          onChange={(checked) => updateRetirement(retirement.tipo, { enabled: checked })}
                          label={RETIREMENT_LABELS[retirement.tipo]}
                          description="Disponibilizar esta opção para o plano"
                        />

                        {retirement.enabled && (
                          <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                            <Field label="Idade mínima" htmlFor={`age-${retirement.tipo}`}>
                              <Input
                                id={`age-${retirement.tipo}`}
                                type="number"
                                min="0"
                                max="120"
                                value={retirement.idadeMinima}
                                onChange={(event) => updateRetirement(retirement.tipo, { idadeMinima: event.target.value })}
                                required
                              />
                            </Field>
                            <Field label="Carência de vinculação (meses)" htmlFor={`vesting-${retirement.tipo}`} hint="Ex.: 60 meses equivalem a 5 anos">
                              <Input
                                id={`vesting-${retirement.tipo}`}
                                type="number"
                                min="0"
                                value={retirement.carenciaVinculacaoMeses}
                                onChange={(event) => updateRetirement(retirement.tipo, { carenciaVinculacaoMeses: event.target.value })}
                                required
                              />
                            </Field>
                            <div className="sm:col-span-2">
                              <CheckboxRow
                                checked={retirement.exigeTerminoVinculo}
                                onChange={(checked) => updateRetirement(retirement.tipo, { exigeTerminoVinculo: checked })}
                                label="Exige término do vínculo empregatício"
                              />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label htmlFor={`formula-${retirement.tipo}`}>Fórmula mínima customizada</Label>
                              <textarea
                                id={`formula-${retirement.tipo}`}
                                value={retirement.formulaMinimaCustomizada}
                                onChange={(event) => updateRetirement(retirement.tipo, { formulaMinimaCustomizada: event.target.value })}
                                placeholder="Ex.: 3 * salario_participacao * (servico_creditado / 35)"
                                className={textareaClassName}
                                maxLength={2_000}
                              />
                              <p className="text-xs leading-5 text-muted-foreground">Use apenas para regras especiais previstas no regulamento.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <SectionTitle
                    title="Configurador de desembolso"
                    description="Defina o saque inicial e as modalidades que o participante poderá escolher."
                  />
                  <div className="rounded-[var(--vivest-radius-3)] border border-border p-4">
                    <CheckboxRow
                      checked={form.permiteSaqueInicial}
                      onChange={(checked) => setForm((current) => ({
                        ...current,
                        permiteSaqueInicial: checked,
                        percentualMaxSaque: checked ? current.percentualMaxSaque || "25" : "",
                      }))}
                      label="Permitir saque inicial"
                      description="Libera o resgate de uma parcela do saldo antes da renda mensal"
                    />
                    {form.permiteSaqueInicial && (
                      <div className="mt-4 border-t border-border pt-4">
                        <RangeField
                          id="withdrawal-percentage"
                          label="Percentual máximo do saque"
                          value={form.percentualMaxSaque}
                          min={0.1}
                          max={100}
                          step={0.1}
                          suffix="%"
                          onChange={(value) => setForm((current) => ({ ...current, percentualMaxSaque: value }))}
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-4">
                    {form.incomes.map((income) => {
                      const option = INCOME_OPTIONS.find((item) => item.value === income.modalidadeTipo)!
                      return (
                        <div key={income.modalidadeTipo} className="rounded-[var(--vivest-radius-3)] border border-border p-4">
                          <CheckboxRow
                            checked={income.enabled}
                            onChange={(checked) => updateIncome(income.modalidadeTipo, { enabled: checked })}
                            label={option.label}
                            description={option.description}
                          />
                          {income.enabled && income.modalidadeTipo === "percentual_saldo" && (
                            <div className="mt-4 grid gap-5 border-t border-border pt-4 sm:grid-cols-2">
                              <RangeField
                                id="income-percentage-min"
                                label="Percentual mínimo"
                                value={income.percentualRendaMin}
                                min={0.1}
                                max={100}
                                step={0.1}
                                suffix="%"
                                onChange={(value) => updateIncome(income.modalidadeTipo, { percentualRendaMin: value })}
                              />
                              <RangeField
                                id="income-percentage-max"
                                label="Percentual máximo"
                                value={income.percentualRendaMax}
                                min={0.1}
                                max={100}
                                step={0.1}
                                suffix="%"
                                onChange={(value) => updateIncome(income.modalidadeTipo, { percentualRendaMax: value })}
                              />
                            </div>
                          )}
                          {income.enabled && income.modalidadeTipo === "prazo_determinado" && (
                            <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                              <Field label="Prazo mínimo (meses)" htmlFor="term-min">
                                <Input id="term-min" type="number" min="1" value={income.prazoMesesMin} onChange={(event) => updateIncome(income.modalidadeTipo, { prazoMesesMin: event.target.value })} required />
                              </Field>
                              <Field label="Prazo máximo (meses)" htmlFor="term-max">
                                <Input id="term-max" type="number" min="1" value={income.prazoMesesMax} onChange={(event) => updateIncome(income.modalidadeTipo, { prazoMesesMax: event.target.value })} required />
                              </Field>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-4 max-w-sm space-y-2">
                    <Label htmlFor="recalculation-period">Periodicidade de recálculo</Label>
                    <select
                      id="recalculation-period"
                      value={form.periodicidadeRecalculo}
                      onChange={(event) => setForm((current) => ({ ...current, periodicidadeRecalculo: event.target.value as PeriodicidadeRecalculo }))}
                      className={selectClassName}
                    >
                      <option value="mensal">Mensal</option>
                      <option value="anual">Anual</option>
                    </select>
                  </div>
                </section>

                <section>
                  <SectionTitle
                    title="Limites de pagamento"
                    description="Campos opcionais para renda mínima e quitação de saldos baixos."
                  />
                  <div className="grid gap-4 rounded-[var(--vivest-radius-3)] border border-border p-4 sm:grid-cols-2">
                    <Field label="Renda mensal mínima" htmlFor="minimum-income">
                      <Input id="minimum-income" inputMode="decimal" value={form.rendaMensalMinimaUnidade} onChange={(event) => setForm((current) => ({ ...current, rendaMensalMinimaUnidade: event.target.value }))} placeholder="1" />
                    </Field>
                    <Field label="Unidade da renda mínima" htmlFor="minimum-income-unit">
                      <Input id="minimum-income-unit" value={form.unidadeRendaMinima} onChange={(event) => setForm((current) => ({ ...current, unidadeRendaMinima: event.target.value.toUpperCase() }))} placeholder="URMM" maxLength={20} />
                    </Field>
                    <Field label="Limite para quitação do saldo" htmlFor="residual-balance">
                      <Input id="residual-balance" inputMode="decimal" value={form.quitacaoSaldoResidualValor} onChange={(event) => setForm((current) => ({ ...current, quitacaoSaldoResidualValor: event.target.value }))} placeholder="5" />
                    </Field>
                    <Field label="Unidade da quitação" htmlFor="residual-balance-unit">
                      <Input id="residual-balance-unit" value={form.unidadeQuitacaoSaldo} onChange={(event) => setForm((current) => ({ ...current, unidadeQuitacaoSaldo: event.target.value.toUpperCase() }))} placeholder={plano?.unidadeReferencia?.sigla ?? "UR"} maxLength={20} />
                    </Field>
                  </div>
                </section>
              </div>

              <ReceiptSummary form={form} />
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
                {isSubmitting ? "Salvando..." : "Salvar regras de recebimento"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReceiptSummary({ form }: { form: ReceiptDraft }) {
  const enabledRetirements = form.retirements.filter((item) => item.enabled)
  const enabledIncomes = form.incomes.filter((item) => item.enabled)

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
        {enabledRetirements.length === 0 ? (
          <SummaryParagraph>Ative ao menos um tipo de aposentadoria.</SummaryParagraph>
        ) : enabledRetirements.map((retirement) => (
          <SummaryParagraph key={retirement.tipo}>
            <strong className="text-foreground">{RETIREMENT_LABELS[retirement.tipo]}:</strong>{" "}
            exige {formatDraftNumber(retirement.idadeMinima)} anos e {formatDraftNumber(retirement.carenciaVinculacaoMeses)} meses de vinculação
            {retirement.exigeTerminoVinculo ? ", com término do vínculo." : ", sem exigir término do vínculo."}
          </SummaryParagraph>
        ))}

        <SummaryParagraph>
          {form.permiteSaqueInicial
            ? <>É permitido saque inicial de até <strong className="text-foreground">{formatDraftNumber(form.percentualMaxSaque)}%</strong>.</>
            : "Não é permitido saque inicial."}
        </SummaryParagraph>

        {enabledIncomes.length === 0 ? (
          <SummaryParagraph>Ative ao menos uma modalidade de renda.</SummaryParagraph>
        ) : enabledIncomes.map((income) => (
          <SummaryParagraph key={income.modalidadeTipo}>
            <strong className="text-foreground">{INCOME_LABELS[income.modalidadeTipo]}:</strong>{" "}
            {income.modalidadeTipo === "percentual_saldo" && `de ${formatDraftNumber(income.percentualRendaMin)}% a ${formatDraftNumber(income.percentualRendaMax)}% do saldo.`}
            {income.modalidadeTipo === "prazo_determinado" && `de ${formatDraftNumber(income.prazoMesesMin)} a ${formatDraftNumber(income.prazoMesesMax)} meses.`}
            {income.modalidadeTipo === "valor_fixo" && "valor mensal definido pelo participante."}
          </SummaryParagraph>
        ))}
      </div>

      <p className="mt-4 border-t border-border pt-4 text-sm leading-7 text-muted-foreground">
        Recálculo <strong className="text-foreground">{form.periodicidadeRecalculo}</strong>.
      </p>
    </aside>
  )
}

function SummaryParagraph({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[var(--vivest-radius-2)] bg-card px-4 py-3 text-sm leading-7 text-muted-foreground">{children}</p>
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-heading text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function CheckboxRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 accent-action"
      />
      <span>
        <span className="block font-heading text-sm font-semibold text-foreground">{label}</span>
        {description && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>}
      </span>
    </label>
  )
}

function RangeField({
  id,
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  id: string
  label: string
  value: string
  min: number
  max: number
  step: number
  suffix: string
  onChange: (value: string) => void
}) {
  const rangeValue = Number(value) || min
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id}>{label}</Label>
        <span className="font-heading text-sm font-semibold text-action">{formatDraftNumber(value)}{suffix}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={rangeValue}
        onChange={(event) => onChange(event.target.value)}
        className="w-full accent-action"
      />
    </div>
  )
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

function createBlankDraft(): ReceiptDraft {
  return {
    retirements: RETIREMENT_OPTIONS.map((option) => ({
      tipo: option.value,
      enabled: option.value === "normal",
      idadeMinima: "",
      carenciaVinculacaoMeses: "",
      exigeTerminoVinculo: true,
      formulaMinimaCustomizada: "",
    })),
    permiteSaqueInicial: false,
    percentualMaxSaque: "",
    periodicidadeRecalculo: "anual",
    incomes: INCOME_OPTIONS.map((option) => ({
      modalidadeTipo: option.value,
      enabled: option.value === "percentual_saldo",
      percentualRendaMin: option.value === "percentual_saldo" ? "0.1" : "",
      percentualRendaMax: option.value === "percentual_saldo" ? "2.5" : "",
      prazoMesesMin: option.value === "prazo_determinado" ? "120" : "",
      prazoMesesMax: option.value === "prazo_determinado" ? "360" : "",
    })),
    rendaMensalMinimaUnidade: "",
    unidadeRendaMinima: "",
    quitacaoSaldoResidualValor: "",
    unidadeQuitacaoSaldo: "",
  }
}

function rulesToDraft(rules: RegrasRecebimento): ReceiptDraft {
  const blank = createBlankDraft()
  return {
    retirements: blank.retirements.map((draft) => {
      const saved = rules.regrasAposentadoria.find((rule) => rule.tipo === draft.tipo)
      return saved ? {
        tipo: saved.tipo,
        enabled: true,
        idadeMinima: String(saved.idadeMinima),
        carenciaVinculacaoMeses: String(saved.carenciaVinculacaoMeses),
        exigeTerminoVinculo: saved.exigeTerminoVinculo,
        formulaMinimaCustomizada: saved.formulaMinimaCustomizada ?? "",
      } : { ...draft, enabled: rules.regrasAposentadoria.length === 0 ? draft.enabled : false }
    }),
    permiteSaqueInicial: rules.configuracaoRenda.permiteSaqueInicial,
    percentualMaxSaque: numberToDraft(rules.configuracaoRenda.percentualMaxSaque),
    periodicidadeRecalculo: rules.configuracaoRenda.periodicidadeRecalculo ?? "anual",
    incomes: blank.incomes.map((draft) => {
      const saved = rules.configuracaoRenda.modalidades?.find((item) => item.modalidadeTipo === draft.modalidadeTipo)
      return saved ? {
        modalidadeTipo: saved.modalidadeTipo,
        enabled: true,
        percentualRendaMin: numberToDraft(saved.percentualRendaMin),
        percentualRendaMax: numberToDraft(saved.percentualRendaMax),
        prazoMesesMin: numberToDraft(saved.prazoMesesMin),
        prazoMesesMax: numberToDraft(saved.prazoMesesMax),
      } : { ...draft, enabled: (rules.configuracaoRenda.modalidades?.length ?? 0) === 0 ? draft.enabled : false }
    }),
    rendaMensalMinimaUnidade: numberToDraft(rules.limitesPagamento.rendaMensalMinimaUnidade),
    unidadeRendaMinima: rules.limitesPagamento.unidadeRendaMinima ?? "",
    quitacaoSaldoResidualValor: numberToDraft(rules.limitesPagamento.quitacaoSaldoResidualValor),
    unidadeQuitacaoSaldo: rules.limitesPagamento.unidadeQuitacaoSaldo ?? "",
  }
}

function draftToPayload(form: ReceiptDraft, planoId: string) {
  const enabledRetirements = form.retirements.filter((item) => item.enabled)
  const enabledIncomes = form.incomes.filter((item) => item.enabled)

  if (enabledRetirements.length === 0) throw new Error("Ative ao menos um tipo de aposentadoria.")
  if (enabledIncomes.length === 0) throw new Error("Ative ao menos uma modalidade de renda.")

  return {
    planoId,
    regrasAposentadoria: enabledRetirements.map((item) => ({
      tipo: item.tipo,
      idadeMinima: requiredNumber(item.idadeMinima, `idade mínima da aposentadoria ${item.tipo}`),
      carenciaVinculacaoMeses: requiredNumber(item.carenciaVinculacaoMeses, `carência da aposentadoria ${item.tipo}`),
      exigeTerminoVinculo: item.exigeTerminoVinculo,
      formulaMinimaCustomizada: item.formulaMinimaCustomizada.trim() || null,
    })),
    configuracaoRenda: {
      permiteSaqueInicial: form.permiteSaqueInicial,
      percentualMaxSaque: form.permiteSaqueInicial
        ? requiredNumber(form.percentualMaxSaque, "percentual máximo do saque")
        : null,
      periodicidadeRecalculo: form.periodicidadeRecalculo,
      modalidades: enabledIncomes.map((item) => ({
        modalidadeTipo: item.modalidadeTipo,
        percentualRendaMin: item.modalidadeTipo === "percentual_saldo"
          ? requiredNumber(item.percentualRendaMin, "percentual mínimo da renda")
          : null,
        percentualRendaMax: item.modalidadeTipo === "percentual_saldo"
          ? requiredNumber(item.percentualRendaMax, "percentual máximo da renda")
          : null,
        prazoMesesMin: item.modalidadeTipo === "prazo_determinado"
          ? requiredNumber(item.prazoMesesMin, "prazo mínimo")
          : null,
        prazoMesesMax: item.modalidadeTipo === "prazo_determinado"
          ? requiredNumber(item.prazoMesesMax, "prazo máximo")
          : null,
      })),
    },
    limitesPagamento: {
      rendaMensalMinimaUnidade: optionalNumber(form.rendaMensalMinimaUnidade),
      unidadeRendaMinima: optionalText(form.unidadeRendaMinima),
      quitacaoSaldoResidualValor: optionalNumber(form.quitacaoSaldoResidualValor),
      unidadeQuitacaoSaldo: optionalText(form.unidadeQuitacaoSaldo),
    },
  }
}

function requiredNumber(value: string, label: string) {
  const parsed = parseLocalizedNumber(value)
  if (parsed === null) throw new Error(`Informe um valor válido para ${label}.`)
  return parsed
}

function optionalNumber(value: string) {
  if (!value.trim()) return null
  const parsed = parseLocalizedNumber(value)
  if (parsed === null) throw new Error("Revise os valores numéricos informados.")
  return parsed
}

function optionalText(value: string) {
  return value.trim() || null
}

function numberToDraft(value: number | null) {
  return value === null ? "" : String(value)
}

const selectClassName =
  "flex h-11 w-full rounded-[var(--vivest-radius-2)] border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"

const textareaClassName =
  "min-h-20 w-full resize-y rounded-[var(--vivest-radius-2)] border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
