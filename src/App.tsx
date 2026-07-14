import { useEffect, useState } from "react"
import {
  CircleAlert,
  CircleCheck,
  Database,
  FileSliders,
  LoaderCircle,
  Plus,
} from "lucide-react"

import logoVivest from "../assets/images/logo-vivest.svg"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type HealthStatus = "checking" | "connected" | "unavailable"

type HealthResponse = {
  status: "ok"
  database: "connected"
  schema: {
    expectedTables: number
    availableTables: number
    ready: boolean
  }
}

function App() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("checking")
  const [availableTables, setAvailableTables] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function checkHealth() {
      try {
        const response = await fetch("/api/health", { signal: controller.signal })
        if (!response.ok) throw new Error("API indisponível")

        const data = (await response.json()) as HealthResponse
        setAvailableTables(data.schema.availableTables)
        setHealthStatus(data.database === "connected" ? "connected" : "unavailable")
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setHealthStatus("unavailable")
      }
    }

    void checkHealth()
    return () => controller.abort()
  }, [])

  const healthContent = {
    checking: {
      label: "Verificando conexão",
      description: "Aguarde enquanto validamos a API e o banco de dados.",
      icon: <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />,
      variant: "neutral" as const,
    },
    connected: {
      label: "Banco conectado",
      description: `${availableTables ?? 0} de 4 tabelas essenciais disponíveis.`,
      icon: <CircleCheck className="size-4" aria-hidden="true" />,
      variant: "success" as const,
    },
    unavailable: {
      label: "Conexão pendente",
      description: "A API será validada após o primeiro deploy na Vercel.",
      icon: <CircleAlert className="size-4" aria-hidden="true" />,
      variant: "warning" as const,
    },
  }[healthStatus]

  return (
    <div className="min-h-screen bg-page text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-6 px-6 lg:px-8">
          <div className="flex items-center gap-5">
            <img src={logoVivest} alt="Vivest" className="h-9 w-auto" />
            <span className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />
            <span className="hidden font-heading text-base font-semibold text-foreground sm:block">
              Configurador PREV
            </span>
          </div>
          <Badge variant={healthContent.variant} aria-live="polite">
            {healthContent.icon}
            {healthContent.label}
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8 lg:py-14">
        <section className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <p className="mb-2 font-label text-sm font-semibold text-action">PREVIDÊNCIA COMPLEMENTAR</p>
            <h1 className="font-heading text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Planos de contribuição
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">
              Parametrize regras de contribuição para diferentes regulamentos sem alterar o código da aplicação.
            </p>
          </div>
          <Button disabled title="Disponível na próxima etapa">
            <Plus className="size-4" aria-hidden="true" />
            Cadastrar plano
          </Button>
        </section>

        <section className="grid gap-5 md:grid-cols-3" aria-label="Resumo do sistema">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4">
              <div>
                <CardDescription>Planos cadastrados</CardDescription>
                <CardTitle className="mt-2 text-3xl">0</CardTitle>
              </div>
              <div className="grid size-11 place-items-center rounded-[var(--vivest-radius-2)] bg-action-soft text-action">
                <FileSliders className="size-5" aria-hidden="true" />
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4">
              <div>
                <CardDescription>Configurações ativas</CardDescription>
                <CardTitle className="mt-2 text-3xl">0</CardTitle>
              </div>
              <div className="grid size-11 place-items-center rounded-[var(--vivest-radius-2)] bg-action-soft text-action">
                <FileSliders className="size-5" aria-hidden="true" />
              </div>
            </CardHeader>
          </Card>

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

        <section className="mt-8">
          <Card className="border-dashed">
            <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-5 grid size-14 place-items-center rounded-[var(--vivest-radius-full)] bg-action-soft text-action">
                <FileSliders className="size-6" aria-hidden="true" />
              </div>
              <h2 className="font-heading text-2xl font-semibold text-foreground">Nenhum plano cadastrado</h2>
              <p className="mt-3 max-w-lg text-sm leading-7 text-muted-foreground">
                A estrutura inicial está pronta. Na próxima etapa, o cadastro permitirá associar unidades de referência e regras de contribuição a cada plano.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}

export default App
