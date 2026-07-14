### Escala de body (Open Sans)

| Variante | Token size                               | Token line-height                          |
| -------- | ---------------------------------------- | ------------------------------------------ |
| body-md  | `var(--vivest-body-md-font-size)` = 16px | `var(--vivest-body-md-line-height)` = 32px |
| body-sm  | `var(--vivest-body-sm-font-size)` = 14px | `var(--vivest-body-sm-line-height)` = 32px |

---

## Layout e espaçamento

- Use `--vivest-spacing-*` para gap, padding e margin.
- Grade base de 4px: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Prefira Flexbox e Grid para layout — evite `position: absolute` salvo necessidade real.
- Cards e painéis: padding `var(--vivest-spacing-9)` (48px) em desktop, `var(--vivest-spacing-6)` (24px) em mobile.

---

## Border radius

| Elemento     | Token recomendado                                                  |
| ------------ | ------------------------------------------------------------------ |
| Botões       | `var(--vivest-radius-2)` (8px) — gerenciado pelo componente        |
| Cards/modais | `var(--vivest-radius-3)` (12px) ou `var(--vivest-radius-4)` (16px) |
| Badges/chips | `var(--vivest-radius-full)` (9999px)                               |
| Inputs       | gerenciado pelo componente                                         |

---

## Cores

Nunca use hex diretamente — sempre `var(--vivest-color-*)`. Ver `tokens.md` para o mapa completo.

Ação primária da marca: `var(--vivest-color-surface-action)` (roxo #3c2e88).

---

## Responsividade

- Layouts devem ser responsivos por padrão usando Tailwind breakpoints.
- Em mobile, empilhe colunas verticalmente.
- Formulários: `max-width` de 480px centralizado em desktop; full-width em mobile.