import { type FormEvent, useMemo, useState } from "react"
import {
  ArrowRight,
  CalendarDays,
  ChartPie,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ApiClientError,
  obterRegrasRecebimento,
  simularInvestimento,
} from "@/lib/api"
import type {
  CalculoInvestimentoResponse,
  Plano,
  RegrasRecebimento,
} from "@/types/api"

type SimulatorStep = "questions" | "result"

type SimulationForm = {
  planCode: string
  age: string
  salary: string
  annualReturn: string
  retirementAge: string
}

const initialForm: SimulationForm = {
  planCode: "",
  age: "",
  salary: "",
  annualReturn: "4",
  retirementAge: "",
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat("pt-BR")

function todayAsIsoDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`))
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function calculateMinimumRetirementAge(age: number, rules: RegrasRecebimento | null) {
  if (!rules || rules.regrasAposentadoria.length === 0) return age

  return Math.floor(Math.min(...rules.regrasAposentadoria.map((rule) => Math.max(
    rule.idadeMinima,
    age + (rule.carenciaVinculacaoMeses / 12),
  ))))
}

export function InvestmentSimulator({
  planos,
  loadingPlans,
  plansError,
}: {
  planos: Plano[]
  loadingPlans: boolean
  plansError: string | null
}) {
  const [step, setStep] = useState<SimulatorStep>("questions")
  const [form, setForm] = useState<SimulationForm>(initialForm)
  const [result, setResult] = useState<CalculoInvestimentoResponse | null>(null)
  const [receiptRules, setReceiptRules] = useState<RegrasRecebimento | null>(null)
  const [receiptRulesError, setReceiptRulesError] = useState<string | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const availablePlans = useMemo(
    () => planos.filter(
      (plan) => plan.ativo && plan.configuracoesAtivas > 0 && plan.recebimentoConfigurado,
    ),
    [planos],
  )

  const selectedPlan = useMemo(
    () => availablePlans.find((plan) => plan.codPlano === form.planCode) ?? null,
    [availablePlans, form.planCode],
  )

  function updateForm(field: keyof SimulationForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setError(null)
  }

  async function runSimulation(event?: FormEvent) {
    event?.preventDefault()
    const age = parsePositiveNumber(form.age)
    const salary = parsePositiveNumber(form.salary)
    const annualReturn = Number(form.annualReturn)
    const informedRetirementAge = form.retirementAge === ""
      ? null
      : Number(form.retirementAge)

    if (!form.planCode || age === null || salary === null || informedRetirementAge === null) {
      setError("Preencha o plano, as idades e o salário para continuar.")
      return
    }

    if (!selectedPlan) {
      setError("O plano selecionado não está disponível para simulação.")
      return
    }

    if (!Number.isInteger(age) || age > 120) {
      setError("Informe uma idade válida em anos completos.")
      return
    }

    if (!Number.isFinite(annualReturn) || annualReturn < 0 || annualReturn > 100) {
      setError("Informe uma rentabilidade anual entre 0% e 100%.")
      return
    }

    if (
      informedRetirementAge !== null
      && (
        !Number.isInteger(informedRetirementAge)
        || informedRetirementAge < age
        || informedRetirementAge > 120
      )
    ) {
      setError("A idade de aposentadoria deve ser igual ou maior que a idade atual.")
      return
    }

    setIsSimulating(true)
    setError(null)

    try {
      const today = todayAsIsoDate()
      const minimumRetirementAge = calculateMinimumRetirementAge(age, receiptRules)
      const chosenRetirementAge = informedRetirementAge === null
        ? undefined
        : Math.max(informedRetirementAge, minimumRetirementAge)
      const [simulationOutcome, rulesOutcome] = await Promise.allSettled([
        simularInvestimento({
          cod_plano: form.planCode,
          idade_atual: age,
          data_adesao: today,
          data_admissao: today,
          src: salary,
          rentabilidade_anual: annualReturn / 100,
          idade_aposentadoria: chosenRetirementAge,
        }),
        obterRegrasRecebimento(selectedPlan.id),
      ])

      if (simulationOutcome.status === "rejected") throw simulationOutcome.reason

      setResult(simulationOutcome.value)
      if (rulesOutcome.status === "fulfilled") {
        setReceiptRules(rulesOutcome.value.data)
        setReceiptRulesError(null)
        setForm((current) => ({
          ...current,
          retirementAge: String(Math.max(
            Number(current.retirementAge),
            calculateMinimumRetirementAge(age, rulesOutcome.value.data),
          )),
        }))
      } else {
        setReceiptRules(null)
        setReceiptRulesError("Não foi possível carregar as opções de recebimento deste plano.")
      }
      setStep("result")
      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (simulationError) {
      setError(
        simulationError instanceof ApiClientError
          ? simulationError.message
          : "Não foi possível concluir a simulação. Tente novamente.",
      )
    } finally {
      setIsSimulating(false)
    }
  }

  function restart() {
    setStep("questions")
    setResult(null)
    setReceiptRules(null)
    setReceiptRulesError(null)
    setForm((current) => ({ ...current, retirementAge: "" }))
    setError(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--vivest-color-surface-action)_5%,white)_0%,white_36%)]">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-8 lg:py-14">
        <SimulatorProgress step={step} />

        {step === "questions" ? (
          <QuestionsStep
            form={form}
            planos={availablePlans}
            loadingPlans={loadingPlans}
            plansError={plansError}
            isSimulating={isSimulating}
            error={error}
            onChange={updateForm}
            onSubmit={runSimulation}
          />
        ) : result && selectedPlan ? (
          <ResultStep
            form={form}
            plan={selectedPlan}
            result={result}
            receiptRules={receiptRules}
            receiptRulesError={receiptRulesError}
            isSimulating={isSimulating}
            error={error}
            onChange={updateForm}
            onRecalculate={runSimulation}
            onRestart={restart}
          />
        ) : null}
      </div>
    </main>
  )
}

function SimulatorProgress({ step }: { step: SimulatorStep }) {
  const resultActive = step === "result"

  return (
    <nav className="mx-auto mb-8 flex max-w-md items-center" aria-label="Etapas da simulação">
      <ProgressItem number="1" label="Seus dados" active={!resultActive} complete={resultActive} />
      <span className={`mb-6 h-px flex-1 ${resultActive ? "bg-primary" : "bg-border"}`} aria-hidden="true" />
      <ProgressItem number="2" label="Resultado" active={resultActive} complete={false} />
    </nav>
  )
}

function ProgressItem({
  number,
  label,
  active,
  complete,
}: {
  number: string
  label: string
  active: boolean
  complete: boolean
}) {
  return (
    <div className="flex min-w-24 flex-col items-center gap-2">
      <span className={`grid size-9 place-items-center rounded-full border font-label text-sm font-semibold ${
        active || complete
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground"
      }`}>
        {number}
      </span>
      <span className={`font-label text-xs font-semibold ${active ? "text-action" : "text-muted-foreground"}`}>
        {label}
      </span>
    </div>
  )
}

function QuestionsStep({
  form,
  planos,
  loadingPlans,
  plansError,
  isSimulating,
  error,
  onChange,
  onSubmit,
}: {
  form: SimulationForm
  planos: Plano[]
  loadingPlans: boolean
  plansError: string | null
  isSimulating: boolean
  error: string | null
  onChange: (field: keyof SimulationForm, value: string) => void
  onSubmit: (event: FormEvent) => void
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-full bg-action-soft text-action">
          <Sparkles className="size-6" aria-hidden="true" />
        </div>
        <p className="mb-2 font-label text-sm font-semibold uppercase tracking-[0.16em] text-action">
          Simulador de previdência
        </p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Comece a planejar o seu futuro
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-muted-foreground">
          Conte um pouco sobre você. Em poucos segundos, estimamos suas contribuições e o patrimônio projetado para a aposentadoria.
        </p>
      </div>

      <Card className="overflow-hidden shadow-[0_20px_60px_rgba(60,46,136,0.09)]">
        <div className="h-1.5 bg-primary" />
        <CardContent className="p-6 sm:p-8 md:p-10">
          <form className="space-y-7" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="simulation-plan">Qual plano você quer simular?</Label>
              <select
                id="simulation-plan"
                value={form.planCode}
                onChange={(event) => onChange("planCode", event.target.value)}
                disabled={loadingPlans}
                className="flex h-12 w-full rounded-[var(--vivest-radius-2)] border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:bg-muted"
              >
                <option value="">{
                  loadingPlans
                    ? "Carregando planos..."
                    : planos.length === 0
                      ? "Nenhum plano disponível para simulação"
                      : "Selecione um plano"
                }</option>
                {planos.map((plan) => (
                  <option key={plan.id} value={plan.codPlano}>{plan.nome} — {plan.sigla}</option>
                ))}
              </select>
              {plansError && <p className="text-sm text-error">{plansError}</p>}
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="simulation-age">Qual é a sua idade?</Label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="simulation-age"
                    type="number"
                    min="1"
                    max="120"
                    step="1"
                    inputMode="numeric"
                    placeholder="Ex.: 35"
                    value={form.age}
                    onChange={(event) => onChange("age", event.target.value)}
                    className="h-12 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="simulation-retirement-age">Com qual idade você pretende se aposentar?</Label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="simulation-retirement-age"
                    type="number"
                    min={form.age || "1"}
                    max="120"
                    step="1"
                    inputMode="numeric"
                    placeholder="Ex.: 65"
                    value={form.retirementAge}
                    onChange={(event) => onChange("retirementAge", event.target.value)}
                    className="h-12 pl-10"
                  />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">A idade mínima prevista no regulamento do plano será respeitada.</p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="simulation-salary">Qual é o seu salário mensal?</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-label text-sm font-semibold text-muted-foreground">R$</span>
                  <Input
                    id="simulation-salary"
                    type="number"
                    min="1"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="Ex.: 8.000"
                    value={form.salary}
                    onChange={(event) => onChange("salary", event.target.value)}
                    className="h-12 pl-11"
                  />
                </div>
                <p className="text-xs leading-5 text-muted-foreground">Utilizaremos este valor como salário real de contribuição (SRC).</p>
              </div>
            </div>

            {error && <ErrorMessage message={error} />}

            <Button type="submit" size="lg" className="w-full" disabled={isSimulating || loadingPlans}>
              {isSimulating ? (
                <><LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Calculando...</>
              ) : (
                <>Simular meu investimento <ArrowRight className="size-4" aria-hidden="true" /></>
              )}
            </Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              Esta simulação é uma estimativa e não representa garantia de rentabilidade futura.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function ResultStep({
  form,
  plan,
  result,
  receiptRules,
  receiptRulesError,
  isSimulating,
  error,
  onChange,
  onRecalculate,
  onRestart,
}: {
  form: SimulationForm
  plan: Plano
  result: CalculoInvestimentoResponse
  receiptRules: RegrasRecebimento | null
  receiptRulesError: string | null
  isSimulating: boolean
  error: string | null
  onChange: (field: keyof SimulationForm, value: string) => void
  onRecalculate: () => void
  onRestart: () => void
}) {
  const input = result.parametrosEntrada
  const monthlyTotal = input.basicaParticipante + input.basicaEmpresa
  const totalParticipant = result.totaisAportes.totalBasicaParticipante
  const totalCompany = result.totaisAportes.totalBasicaEmpresa
  const earnings = Math.max(0, result.rentabilidade.valorRendimento)
  const chartTotal = Math.max(totalParticipant + totalCompany + earnings, 1)
  const participantEnd = (totalParticipant / chartTotal) * 100
  const companyEnd = participantEnd + (totalCompany / chartTotal) * 100
  const chartStyle = {
    background: `conic-gradient(var(--vivest-color-surface-action) 0 ${participantEnd}%, var(--vivest-color-surface-action-error) ${participantEnd}% ${companyEnd}%, #2f94ad ${companyEnd}% 100%)`,
  }
  const [withdrawInitial, setWithdrawInitial] = useState(false)
  const fixedIncome = receiptRules?.configuracaoRenda.modalidades.find(
    (modality) => modality.modalidadeTipo === "valor_fixo" && modality.ativo,
  )
  const minimumUnits = receiptRules?.limitesPagamento.rendaMensalMinimaUnidade ?? null
  const referenceUnitValue = plan.unidadeReferencia === null
    ? null
    : Number(plan.unidadeReferencia.valorAtual)
  const minimumBenefit = minimumUnits !== null && referenceUnitValue !== null
    ? minimumUnits * referenceUnitValue
    : null
  const maximumPercentage = fixedIncome?.percentualMaxSaldoValorFixo ?? null
  const maximumBenefit = maximumPercentage === null
    ? null
    : result.valorFuturoTotal * (maximumPercentage / 100)
  const benefitRangeAvailable = minimumBenefit !== null
    && maximumBenefit !== null
    && maximumBenefit >= minimumBenefit
  const [monthlyBenefit, setMonthlyBenefit] = useState(minimumBenefit ?? 0)
  const displayedMonthlyBenefit = minimumBenefit !== null && maximumBenefit !== null
    ? Math.min(Math.max(monthlyBenefit || minimumBenefit, minimumBenefit), maximumBenefit)
    : 0
  const sliderStep = minimumBenefit !== null && maximumBenefit !== null
    ? Math.max((maximumBenefit - minimumBenefit) / 100, 0.01)
    : 0.01
  const withdrawalPercentage = receiptRules?.configuracaoRenda.percentualMaxSaque ?? null
  const maximumWithdrawal = withdrawalPercentage === null
    ? null
    : result.valorFuturoTotal * (withdrawalPercentage / 100)
  const currentAge = Number(form.age)
  const minimumRetirementAge = calculateMinimumRetirementAge(currentAge, receiptRules)
  const selectedRetirementAge = Math.max(
    Number(form.retirementAge) || minimumRetirementAge,
    minimumRetirementAge,
  )
  const maximumRetirementAge = Math.max(90, minimumRetirementAge)

  return (
    <div>
      <section className="mb-8 overflow-hidden rounded-[var(--vivest-radius-4)] bg-primary px-6 py-8 text-center text-primary-foreground sm:px-10 md:py-10">
        <p className="font-label text-sm font-semibold uppercase tracking-[0.16em] text-white/75">Simulação concluída</p>
        <h1 className="mx-auto mt-2 max-w-4xl font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          Sua simulação do plano {plan.sigla} está pronta
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-white/80 md:text-base">
          Explore os valores projetados e altere os parâmetros para comparar outros cenários.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProjectionCard label="Hoje" icon={<Wallet className="size-5" aria-hidden="true" />}>
          <p className="text-sm text-muted-foreground">Contribuições mensais calculadas conforme as regras do plano</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <ValueBox label="Você contribui" value={currencyFormatter.format(input.basicaParticipante)} />
            <ValueBox label="A empresa contribui" value={currencyFormatter.format(input.basicaEmpresa)} accent />
          </div>
          <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5">
            <span className="font-label text-sm font-semibold text-foreground">Total investido por mês</span>
            <strong className="font-heading text-2xl font-semibold text-action">{currencyFormatter.format(monthlyTotal)}</strong>
          </div>
          <dl className="mt-7 grid gap-4 rounded-[var(--vivest-radius-2)] bg-action-soft p-5 sm:grid-cols-2">
            <SummaryDefinition label="Seu salário (SRC)" value={currencyFormatter.format(Number(form.salary))} />
            <SummaryDefinition label="Parcelas anuais" value={input.considerar_decimo ? "13 parcelas" : "12 parcelas"} />
          </dl>
        </ProjectionCard>

        <ProjectionCard label="Futuro" icon={<TrendingUp className="size-5" aria-hidden="true" />}>
          <p className="text-sm text-muted-foreground">Patrimônio estimado na primeira data de elegibilidade</p>
          <p className="mt-3 font-heading text-4xl font-semibold tracking-tight text-action md:text-5xl">
            {currencyFormatter.format(result.valorFuturoTotal)}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            Projeção para {formatDate(input.dataFim)}
          </p>
          <p className="mt-2 inline-flex rounded-full bg-action-soft px-3 py-1 font-label text-xs font-semibold text-action">
            Aposentadoria aos {selectedRetirementAge} anos
          </p>

          <div className="mt-7 grid items-center gap-7 border-t border-border pt-6 sm:grid-cols-[160px_1fr]">
            <div className="relative mx-auto size-36 rounded-full" style={chartStyle} role="img" aria-label="Composição do patrimônio projetado">
              <div className="absolute inset-5 grid place-items-center rounded-full bg-card text-center">
                <div>
                  <ChartPie className="mx-auto size-5 text-action" aria-hidden="true" />
                  <span className="mt-1 block font-label text-xs font-semibold text-muted-foreground">Composição</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <ChartLegend color="bg-primary" label="Suas contribuições" value={totalParticipant} />
              <ChartLegend color="bg-error" label="Contribuições da empresa" value={totalCompany} />
              <ChartLegend color="bg-[#2f94ad]" label="Rendimentos" value={earnings} />
            </div>
          </div>

          <div className="mt-7 border-t border-border pt-6">
            <p className="font-label text-xs font-semibold uppercase tracking-[0.15em] text-action">Opções de recebimento</p>
            <h2 className="mt-2 font-heading text-xl font-semibold text-foreground">Como você poderá receber</h2>

            {receiptRulesError ? (
              <div className="mt-5"><ErrorMessage message={receiptRulesError} /></div>
            ) : receiptRules ? (
              <div className="mt-5 space-y-6">
                {receiptRules.configuracaoRenda.permiteSaqueInicial && withdrawalPercentage !== null && (
                  <div className="rounded-[var(--vivest-radius-2)] border border-border p-4">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div>
                        <p className="font-label text-sm font-semibold text-foreground">Saque inicial de até {withdrawalPercentage.toLocaleString("pt-BR")}%</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Limite estimado de {currencyFormatter.format(maximumWithdrawal ?? 0)}.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 rounded-[var(--vivest-radius-2)] bg-action-soft p-1" role="group" aria-label="Deseja realizar o saque inicial?">
                        <Button type="button" size="sm" variant={withdrawInitial ? "default" : "ghost"} onClick={() => setWithdrawInitial(true)}>Sim</Button>
                        <Button type="button" size="sm" variant={!withdrawInitial ? "default" : "ghost"} onClick={() => setWithdrawInitial(false)}>Não</Button>
                      </div>
                    </div>
                    {withdrawInitial && (
                      <p className="mt-3 rounded-[var(--vivest-radius-1)] bg-action-soft px-3 py-2 text-xs text-action">
                        Você poderá escolher o valor do saque, respeitando o limite máximo, no momento da concessão.
                      </p>
                    )}
                  </div>
                )}

                {fixedIncome && minimumBenefit !== null && maximumBenefit !== null ? (
                  <div>
                    <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                      <div>
                        <p className="font-label text-sm font-semibold text-foreground">Renda mensal em valor fixo</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Escolha uma renda entre o mínimo regulamentar e {maximumPercentage?.toLocaleString("pt-BR")}% do saldo projetado.
                        </p>
                      </div>
                      <strong className="font-heading text-2xl font-semibold text-action">
                        {currencyFormatter.format(benefitRangeAvailable ? displayedMonthlyBenefit : maximumBenefit)}
                      </strong>
                    </div>

                    {benefitRangeAvailable ? (
                      <>
                        <input
                          type="range"
                          min={minimumBenefit}
                          max={maximumBenefit}
                          step={sliderStep}
                          value={displayedMonthlyBenefit}
                          onChange={(event) => setMonthlyBenefit(Number(event.target.value))}
                          className="benefit-slider mt-5 w-full accent-[var(--vivest-color-surface-action)]"
                          aria-label="Valor da renda mensal"
                        />
                        <div className="mt-2 flex justify-between gap-4 text-xs text-muted-foreground">
                          <span>
                            Mínimo: {currencyFormatter.format(minimumBenefit)} · {minimumUnits?.toLocaleString("pt-BR")} {receiptRules.limitesPagamento.unidadeRendaMinima}
                          </span>
                          <span className="text-right">Máximo: {currencyFormatter.format(maximumBenefit)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="mt-4 rounded-[var(--vivest-radius-2)] bg-warning p-4 text-sm text-warning-foreground">
                        O saldo projetado não alcança a renda mensal mínima de {currencyFormatter.format(minimumBenefit)}.
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="rounded-[var(--vivest-radius-2)] bg-action-soft p-4 text-sm text-muted-foreground">
                    Este plano não possui uma modalidade de renda mensal fixa completamente configurada.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </ProjectionCard>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
          <CardContent className="border-b border-border p-6 sm:p-8 lg:border-b-0 lg:border-r">
            <p className="font-label text-xs font-semibold uppercase tracking-[0.15em] text-action">Detalhes da projeção</p>
            <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">De onde vem o seu patrimônio</h2>
            <dl className="mt-6 space-y-4">
              <ResultLine label="Total aportado sem rentabilidade" value={result.totaisAportes.totalAportadoSemRentabilidade} />
              <ResultLine label="Rendimentos acumulados" value={result.rentabilidade.valorRendimento} highlight />
              <ResultLine label="Período da simulação" text={`${numberFormatter.format(result.periodosCalculados.mesesCompletos)} meses`} />
              <ResultLine label="Rentabilidade sobre o total aportado" text={`${result.rentabilidade.percentualSobreAportado.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`} />
            </dl>
          </CardContent>

          <CardContent className="bg-[color-mix(in_srgb,var(--vivest-color-surface-action)_4%,white)] p-6 sm:p-8">
            <p className="font-label text-xs font-semibold uppercase tracking-[0.15em] text-action">Parâmetros</p>
            <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">Teste outro cenário</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <ParameterInput label="Idade atual" suffix="anos" value={form.age} onChange={(value) => onChange("age", value)} />
              <ParameterInput label="Salário mensal" prefix="R$" value={form.salary} onChange={(value) => onChange("salary", value)} step="0.01" />
            </div>
            <div className="mt-4">
              <ParameterInput label="Rentabilidade anual" suffix="% a.a." value={form.annualReturn} onChange={(value) => onChange("annualReturn", value)} step="0.1" />
            </div>
            <div className="mt-6 border-t border-border pt-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <Label htmlFor="retirement-age">Idade de aposentadoria</Label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    A elegibilidade deste cenário começa aos {minimumRetirementAge} anos.
                  </p>
                </div>
                <strong className="font-heading text-2xl font-semibold text-action">
                  {selectedRetirementAge} anos
                </strong>
              </div>
              <input
                id="retirement-age"
                type="range"
                min={minimumRetirementAge}
                max={maximumRetirementAge}
                step="1"
                value={selectedRetirementAge}
                onChange={(event) => onChange("retirementAge", event.target.value)}
                className="mt-4 w-full accent-[var(--vivest-color-surface-action)]"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{minimumRetirementAge} anos</span>
                <span>{maximumRetirementAge} anos</span>
              </div>
            </div>
            {error && <div className="mt-4"><ErrorMessage message={error} /></div>}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button className="flex-1" onClick={onRecalculate} disabled={isSimulating}>
                {isSimulating ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
                Recalcular
              </Button>
              <Button variant="outline" onClick={onRestart}>Nova simulação</Button>
            </div>
          </CardContent>
        </div>
      </Card>
    </div>
  )
}

function ProjectionCard({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="relative overflow-hidden pt-3 shadow-sm">
      <div className="absolute left-6 top-0 flex min-w-32 items-center justify-center gap-2 rounded-b-[var(--vivest-radius-2)] bg-primary px-5 py-2 font-label text-sm font-semibold uppercase tracking-[0.12em] text-primary-foreground">
        {icon}{label}
      </div>
      <CardContent className="p-6 pt-14 sm:p-8 sm:pt-16">{children}</CardContent>
    </Card>
  )
}

function ValueBox({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-[var(--vivest-radius-2)] border p-5 ${accent ? "border-primary/25 bg-action-soft" : "border-border"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-heading text-2xl font-semibold text-action">{value}</p>
    </div>
  )
}

function SummaryDefinition({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-label text-sm font-semibold text-foreground">{value}</dd></div>
}

function ChartLegend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-label text-sm font-semibold text-foreground">{currencyFormatter.format(value)}</p></div>
    </div>
  )
}

function ResultLine({ label, value, text, highlight = false }: { label: string; value?: number; text?: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-right font-label text-sm font-semibold ${highlight ? "text-success-foreground" : "text-foreground"}`}>
        {value !== undefined ? currencyFormatter.format(value) : text}
      </dd>
    </div>
  )
}

function ParameterInput({ label, value, onChange, prefix, suffix, step = "1" }: { label: string; value: string; onChange: (value: string) => void; prefix?: string; suffix?: string; step?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">{prefix}</span>}
        <Input type="number" min="0" step={step} value={value} onChange={(event) => onChange(event.target.value)} className={`${prefix ? "pl-10" : ""} ${suffix ? "pr-16" : ""}`} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  )
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--vivest-radius-2)] border border-error bg-error-soft p-4" role="alert">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-error" aria-hidden="true" />
      <p className="text-sm leading-6 text-error">{message}</p>
    </div>
  )
}
