import { FileSliders, HandCoins, Settings2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Plano } from "@/types/api"

export function PlansList({
  planos,
  loading,
  onConfigure,
  onConfigureReceipt,
}: {
  planos: Plano[]
  loading: boolean
  onConfigure: (plano: Plano) => void
  onConfigureReceipt: (plano: Plano) => void
}) {
  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-72 items-center justify-center px-6 py-12">
          <p className="text-sm text-muted-foreground">Carregando planos...</p>
        </CardContent>
      </Card>
    )
  }

  if (planos.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-5 grid size-14 place-items-center rounded-[var(--vivest-radius-full)] bg-action-soft text-action">
            <FileSliders className="size-6" aria-hidden="true" />
          </div>
          <h2 className="font-heading text-2xl font-semibold text-foreground">Nenhum plano cadastrado</h2>
          <p className="mt-3 max-w-lg text-sm leading-7 text-muted-foreground">
            Cadastre o primeiro plano e associe uma unidade de referência para começar a parametrização.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle>Planos cadastrados</CardTitle>
        <CardDescription>Selecione um plano para configurar contribuição ou recebimento do benefício.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 p-6 md:grid-cols-2">
        {planos.map((plano) => (
          <article key={plano.id} className="rounded-[var(--vivest-radius-3)] border border-border p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge>{plano.sigla}</Badge>
                  <Badge variant={plano.ativo ? "success" : "neutral"}>{plano.ativo ? "Ativo" : "Inativo"}</Badge>
                </div>
                <h3 className="truncate font-heading text-lg font-semibold text-foreground">{plano.nome}</h3>
                <p className="mt-1 text-sm text-muted-foreground">Código: {plano.codPlano}</p>
              </div>
              <div className="grid size-10 shrink-0 place-items-center rounded-[var(--vivest-radius-2)] bg-action-soft text-action">
                <FileSliders className="size-5" aria-hidden="true" />
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Unidade</dt>
                <dd className="mt-1 font-semibold text-foreground">{plano.unidadeReferencia?.sigla ?? "Não definida"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Configurações</dt>
                <dd className="mt-1 font-semibold text-foreground">{plano.configuracoesAtivas}</dd>
              </div>
            </dl>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => onConfigure(plano)}>
                <Settings2 className="size-4" aria-hidden="true" />
                Contribuição
              </Button>
              <Button variant="outline" onClick={() => onConfigureReceipt(plano)}>
                <HandCoins className="size-4" aria-hidden="true" />
                {plano.recebimentoConfigurado ? "Editar recebimento" : "Recebimento"}
              </Button>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  )
}
