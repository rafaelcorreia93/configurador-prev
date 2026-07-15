import { useCallback, useEffect, useState } from "react"
import {
  CircleAlert,
  CircleCheck,
  Database,
  FileSliders,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react"

import logoVivest from "../assets/images/logo-vivest.svg"
import { ConfigurationDialog } from "@/components/configurations/configuration-dialog"
import { PlanFormDialog } from "@/components/plans/plan-form-dialog"
import { PlansList } from "@/components/plans/plans-list"
import { ReceiptRulesDialog } from "@/components/receipt-rules/receipt-rules-dialog"
import { InvestmentSimulator } from "@/components/simulator/investment-simulator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { apiRequest } from "@/lib/api"
import type {
  HealthResponse,
  Plano,
  PlanosResponse,
  UnidadeReferencia,
  UnidadesResponse,
} from "@/types/api"

type HealthStatus = "checking" | "connected" | "unavailable"
type CatalogStatus = "loading" | "ready" | "error"
type ActiveArea = "simulator" | "admin"

function App() {
  const [activeArea, setActiveArea] = useState<ActiveArea>(
    () => window.location.hash === "#admin" ? "admin" : "simulator",
  )
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("checking")
  const [availableTables, setAvailableTables] = useState<number | null>(null)
  const [expectedTables, setExpectedTables] = useState(7)
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("loading")
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [planos, setPlanos] = useState<Plano[]>([])
  const [unidades, setUnidades] = useState<UnidadeReferencia[]>([])
  const [totalPlanos, setTotalPlanos] = useState(0)
  const [totalConfiguracoes, setTotalConfiguracoes] = useState(0)
  const [isPlanDialogOpen, setIsPlanDialogOpen] = useState(false)
  const [configurationPlan, setConfigurationPlan] = useState<Plano | null>(null)
  const [receiptPlan, setReceiptPlan] = useState<Plano | null>(null)

  const loadCatalog = useCallback(async (signal?: AbortSignal) => {
    try {
      const [planosResponse, unidadesResponse] = await Promise.all([
        apiRequest<PlanosResponse>("/api/planos", { signal }),
        apiRequest<UnidadesResponse>("/api/unidades-referencia", { signal }),
      ])

      setPlanos(planosResponse.data)
      setTotalPlanos(planosResponse.meta.totalPlanos)
      setTotalConfiguracoes(planosResponse.meta.totalConfiguracoesAtivas)
      setUnidades(unidadesResponse.data)
      setCatalogStatus("ready")
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setCatalogError(error instanceof Error ? error.message : "Não foi possível carregar os planos.")
      setCatalogStatus("error")
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function checkHealth() {
      try {
        const data = await apiRequest<HealthResponse>("/api/health", { signal: controller.signal })
        setAvailableTables(data.schema.availableTables)
        setExpectedTables(data.schema.expectedTables)
        setHealthStatus(data.database === "connected" ? "connected" : "unavailable")
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setHealthStatus("unavailable")
      }
    }

    void checkHealth()
    void Promise.resolve().then(() => loadCatalog(controller.signal))
    return () => controller.abort()
  }, [loadCatalog])

  const healthContent = {
    checking: {
      label: "Verificando conexão",
      description: "Aguarde enquanto validamos a API e o banco de dados.",
      icon: <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />,
      variant: "neutral" as const,
    },
    connected: {
      label: "Banco conectado",
      description: `${availableTables ?? 0} de ${expectedTables} tabelas essenciais disponíveis.`,
      icon: <CircleCheck className="size-4" aria-hidden="true" />,
      variant: "success" as const,
    },
    unavailable: {
      label: "Conexão indisponível",
      description: "Não foi possível consultar a API neste ambiente.",
      icon: <CircleAlert className="size-4" aria-hidden="true" />,
      variant: "warning" as const,
    },
  }[healthStatus]

  function handleUnidadeCreated(unidade: UnidadeReferencia) {
    setUnidades((current) => [...current, unidade].sort((a, b) => a.sigla.localeCompare(b.sigla)))
  }

  function handleRetryCatalog() {
    setCatalogStatus("loading")
    setCatalogError(null)
    void loadCatalog()
  }

  function navigateTo(area: ActiveArea) {
    setActiveArea(area)
    window.history.replaceState(null, "", area === "admin" ? "#admin" : "#simulador")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="min-h-screen bg-page text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-5">
            <img src={logoVivest} alt="Vivest" className="h-auto w-[92px] shrink-0 sm:h-9 sm:w-auto" />
            <span className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />
            <span className="hidden font-heading text-base font-semibold text-foreground sm:block">
              {activeArea === "admin" ? "Configurador PREV" : "Simulador PREV"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex items-center rounded-[var(--vivest-radius-2)] bg-action-soft p-1" aria-label="Áreas da aplicação">
              <Button
                variant={activeArea === "simulator" ? "default" : "ghost"}
                size="sm"
                onClick={() => navigateTo("simulator")}
                aria-current={activeArea === "simulator" ? "page" : undefined}
              >
                Simulador
              </Button>
              <Button
                variant={activeArea === "admin" ? "default" : "ghost"}
                size="sm"
                onClick={() => navigateTo("admin")}
                aria-current={activeArea === "admin" ? "page" : undefined}
              >
                <span className="sm:hidden">Admin</span>
                <span className="hidden sm:inline">Administração</span>
              </Button>
            </nav>
            {activeArea === "admin" && (
              <Badge className="hidden lg:inline-flex" variant={healthContent.variant} aria-live="polite">
                {healthContent.icon}
                {healthContent.label}
              </Badge>
            )}
          </div>
        </div>
      </header>

      {activeArea === "simulator" ? (
        <InvestmentSimulator
          planos={planos}
          loadingPlans={catalogStatus === "loading"}
          plansError={catalogStatus === "error" ? catalogError : null}
        />
      ) : (
      <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8 lg:py-14">
        <section className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <p className="mb-2 font-label text-sm font-semibold text-action">PREVIDÊNCIA COMPLEMENTAR</p>
            <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Planos de previdência
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">
              Parametrize as regras de contribuição e recebimento de diferentes regulamentos sem alterar o código da aplicação.
            </p>
          </div>
          <Button onClick={() => setIsPlanDialogOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Cadastrar plano
          </Button>
        </section>

        <section className="grid gap-5 md:grid-cols-3" aria-label="Resumo do sistema">
          <SummaryCard
            label="Planos cadastrados"
            value={catalogStatus === "loading" ? "—" : String(totalPlanos)}
            icon={<FileSliders className="size-5" aria-hidden="true" />}
          />
          <SummaryCard
            label="Configurações ativas"
            value={catalogStatus === "loading" ? "—" : String(totalConfiguracoes)}
            icon={<FileSliders className="size-5" aria-hidden="true" />}
          />

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4">
              <div>
                <CardDescription>Infraestrutura</CardDescription>
                <CardTitle className="mt-2 text-lg">{healthContent.label}</CardTitle>
              </div>
              <div className="grid size-11 place-items-center rounded-[var(--vivest-radius-2)] bg-action-soft text-action">
                <Database className="size-5" aria-hidden="true" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">{healthContent.description}</p>
            </CardContent>
          </Card>
        </section>

        {catalogStatus === "error" && (
          <div className="mt-8 flex flex-col gap-4 rounded-[var(--vivest-radius-3)] border border-error bg-error-soft p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-1 size-5 shrink-0 text-error" aria-hidden="true" />
              <div>
                <p className="font-heading text-sm font-semibold text-foreground">Não foi possível carregar os dados</p>
                <p className="mt-1 text-sm text-error">{catalogError}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleRetryCatalog}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Tentar novamente
            </Button>
          </div>
        )}

        <section className="mt-8">
          <PlansList
            planos={planos}
            loading={catalogStatus === "loading"}
            onConfigure={setConfigurationPlan}
            onConfigureReceipt={setReceiptPlan}
          />
        </section>
      </main>
      )}

      {activeArea === "admin" && <PlanFormDialog
        open={isPlanDialogOpen}
        onOpenChange={setIsPlanDialogOpen}
        unidades={unidades}
        onUnidadeCreated={handleUnidadeCreated}
        onPlanoCreated={() => loadCatalog()}
      />}

      {activeArea === "admin" && <ConfigurationDialog
        plano={configurationPlan}
        open={configurationPlan !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setConfigurationPlan(null)
        }}
        onSaved={() => loadCatalog()}
      />}

      {activeArea === "admin" && <ReceiptRulesDialog
        plano={receiptPlan}
        open={receiptPlan !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setReceiptPlan(null)
        }}
        onSaved={() => loadCatalog()}
      />}
    </div>
  )
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="mt-2 text-3xl">{value}</CardTitle>
        </div>
        <div className="grid size-11 place-items-center rounded-[var(--vivest-radius-2)] bg-action-soft text-action">
          {icon}
        </div>
      </CardHeader>
    </Card>
  )
}

export default App
