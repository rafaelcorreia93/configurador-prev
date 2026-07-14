import { useState, type FormEvent } from "react"
import { CircleAlert, LoaderCircle, Plus } from "lucide-react"

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
import { ApiClientError, apiRequest } from "@/lib/api"
import type { UnidadeReferencia } from "@/types/api"

type PlanFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  unidades: UnidadeReferencia[]
  onUnidadeCreated: (unidade: UnidadeReferencia) => void
  onPlanoCreated: () => Promise<void>
}

type UnidadeResponse = { data: UnidadeReferencia }

const initialPlanForm = {
  codPlano: "",
  nome: "",
  sigla: "",
  unidadeReferenciaId: "",
}

export function PlanFormDialog({
  open,
  onOpenChange,
  unidades,
  onUnidadeCreated,
  onPlanoCreated,
}: PlanFormDialogProps) {
  const [form, setForm] = useState(initialPlanForm)
  const [showNewUnit, setShowNewUnit] = useState(false)
  const [unitSigla, setUnitSigla] = useState("")
  const [unitValue, setUnitValue] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [unitError, setUnitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingUnit, setIsSavingUnit] = useState(false)

  function resetForm() {
    setForm(initialPlanForm)
    setShowNewUnit(false)
    setUnitSigla("")
    setUnitValue("")
    setFormError(null)
    setUnitError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm()
    onOpenChange(nextOpen)
  }

  async function handleCreateUnit() {
    setUnitError(null)
    const normalizedValue = normalizeDecimal(unitValue)

    if (!unitSigla.trim() || !normalizedValue.trim()) {
      setUnitError("Informe a sigla e o valor atual da unidade.")
      return
    }

    setIsSavingUnit(true)

    try {
      const response = await apiRequest<UnidadeResponse>("/api/unidades-referencia", {
        method: "POST",
        body: JSON.stringify({ sigla: unitSigla, valorAtual: normalizedValue }),
      })
      onUnidadeCreated(response.data)
      setForm((current) => ({ ...current, unidadeReferenciaId: response.data.id }))
      setShowNewUnit(false)
      setUnitSigla("")
      setUnitValue("")
    } catch (error) {
      setUnitError(error instanceof Error ? error.message : "Não foi possível cadastrar a unidade.")
    } finally {
      setIsSavingUnit(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setIsSubmitting(true)

    try {
      await apiRequest("/api/planos", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          unidadeReferenciaId: form.unidadeReferenciaId || null,
        }),
      })
      await onPlanoCreated()
      handleOpenChange(false)
    } catch (error) {
      if (error instanceof ApiClientError) {
        const fieldMessage = error.details ? Object.values(error.details)[0] : null
        setFormError(fieldMessage ?? error.message)
      } else {
        setFormError("Não foi possível cadastrar o plano.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar plano</DialogTitle>
          <DialogDescription>
            Informe os dados gerais. As regras de contribuição serão configuradas na próxima etapa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="codPlano">Código do plano</Label>
              <Input
                id="codPlano"
                value={form.codPlano}
                onChange={(event) => setForm((current) => ({ ...current, codPlano: event.target.value }))}
                placeholder="Ex.: 001"
                maxLength={50}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sigla">Sigla do plano</Label>
              <Input
                id="sigla"
                value={form.sigla}
                onChange={(event) => setForm((current) => ({ ...current, sigla: event.target.value }))}
                placeholder="Ex.: EMAE"
                maxLength={50}
                required
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nome">Nome do plano</Label>
              <Input
                id="nome"
                value={form.nome}
                onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                placeholder="Ex.: Plano de Contribuição EMAE"
                maxLength={200}
                required
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="unidadeReferenciaId">Unidade de referência</Label>
                <button
                  type="button"
                  className="font-label text-xs font-semibold text-action hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setShowNewUnit((current) => !current)
                    setUnitError(null)
                  }}
                >
                  {showNewUnit ? "Cancelar nova unidade" : "Cadastrar nova unidade"}
                </button>
              </div>
              <select
                id="unidadeReferenciaId"
                value={form.unidadeReferenciaId}
                onChange={(event) => setForm((current) => ({ ...current, unidadeReferenciaId: event.target.value }))}
                className="flex h-11 w-full rounded-[var(--vivest-radius-2)] border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
              >
                <option value="">Sem unidade de referência</option>
                {unidades.map((unidade) => (
                  <option key={unidade.id} value={unidade.id}>
                    {unidade.sigla} — {Number(unidade.valorAtual).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {showNewUnit && (
            <div className="mt-5 rounded-[var(--vivest-radius-3)] border border-border bg-action-soft p-4">
              <p className="mb-4 font-heading text-sm font-semibold text-foreground">Nova unidade de referência</p>
              <div className="grid gap-4 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor="unitSigla">Sigla da unidade</Label>
                  <Input
                    id="unitSigla"
                    value={unitSigla}
                    onChange={(event) => setUnitSigla(event.target.value)}
                    placeholder="UR"
                    maxLength={20}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unitValue">Valor atual</Label>
                  <Input
                    id="unitValue"
                    value={unitValue}
                    onChange={(event) => setUnitValue(event.target.value)}
                    placeholder="1.000,00"
                    inputMode="decimal"
                  />
                </div>
                <Button type="button" variant="outline" onClick={handleCreateUnit} disabled={isSavingUnit}>
                  {isSavingUnit ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Salvar
                </Button>
              </div>
              {unitError && <InlineError message={unitError} />}
            </div>
          )}

          {formError && <InlineError message={formError} />}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>Cancelar</Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || isSavingUnit}>
              {isSubmitting && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {isSubmitting ? "Salvando..." : "Cadastrar plano"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-[var(--vivest-radius-2)] bg-error-soft px-3 py-2 text-sm leading-6 text-error" role="alert">
      <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  )
}

function normalizeDecimal(value: string) {
  const trimmedValue = value.trim()

  if (trimmedValue.includes(",")) {
    return trimmedValue.replace(/\./g, "").replace(",", ".")
  }

  return trimmedValue
}
