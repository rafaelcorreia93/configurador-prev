# Tokens

## Padrão de nomenclatura

```
--vivest-{categoria}-{subcategoria}-{variante}
```

Categorias: `font`, `color`, `spacing`, `radius`, `border`

---

## Tipografia

| Token                           | Valor       | Uso                                            |
| ------------------------------- | ----------- | ---------------------------------------------- |
| `--vivest-font-family-heading`  | "Campton"   | h1–h6, títulos, labels de UI                   |
| `--vivest-font-family-body`     | "Open Sans" | parágrafos, descrições, links, textos corridos |
| `--vivest-font-family-label`    | "Campton"   | labels de formulário                           |
| `--vivest-font-weight-regular`  | 400         | texto corrido                                  |
| `--vivest-font-weight-medium`   | 500         | ênfase leve                                    |
| `--vivest-font-weight-semibold` | 600         | headings, links de ação                        |
| `--vivest-font-weight-bold`     | 700         | headings principais                            |
| `--vivest-body-md-font-size`    | 16px        | corpo padrão                                   |
| `--vivest-body-md-line-height`  | 32px        |                                                |
| `--vivest-body-sm-font-size`    | 14px        | corpo pequeno, notas                           |
| `--vivest-body-sm-line-height`  | 32px        |                                                |
| `--vivest-label-lg-font-size`   | 20px        |                                                |
| `--vivest-label-md-font-size`   | 16px        |                                                |
| `--vivest-label-sm-font-size`   | 14px        |                                                |
| `--vivest-label-xs-font-size`   | 12px        |                                                |

---

## Cores de texto

| Token                              | Valor hex | Uso                                                     |
| ---------------------------------- | --------- | ------------------------------------------------------- |
| `--vivest-color-text-heading`      | #000000   | títulos                                                 |
| `--vivest-color-text-body`         | #5f5f5f   | textos corridos, descrições                             |
| `--vivest-color-text-action`       | #3c2e88   | links, ações, cor primária                              |
| `--vivest-color-text-action-hover` | #6358a0   | hover de links                                          |
| `--vivest-color-text-disabled`     | #5f5f5f   | texto desabilitado                                      |
| `--vivest-color-text-success`      | #1b894a   | feedback de sucesso                                     |
| `--vivest-color-text-error`        | #e33e5a   | feedback de erro                                        |
| `--vivest-color-text-warning`      | #f0c93a   | feedback de aviso                                       |
| `--vivest-color-text-on-action`    | #ffffff   | texto sobre fundo de ação (ex: dentro de botão primary) |

---

## Cores de superfície

| Token                                       | Valor hex | Uso                        |
| ------------------------------------------- | --------- | -------------------------- |
| `--vivest-color-surface-page`               | #ffffff   | fundo de página            |
| `--vivest-color-surface-default`            | #ffffff   | fundo de card/painel       |
| `--vivest-color-surface-action`             | #3c2e88   | fundo de botão primary     |
| `--vivest-color-surface-action-hover`       | #6358a0   | hover de botão primary     |
| `--vivest-color-surface-disabled`           | #e3e3e3   | fundo desabilitado         |
| `--vivest-color-surface-success`            | #e6faf1   | fundo de alerta sucesso    |
| `--vivest-color-surface-warning`            | #fefaeb   | fundo de alerta aviso      |
| `--vivest-color-surface-information`        | #fefaeb   | fundo de alerta informação |
| `--vivest-color-surface-action-error`       | #e33e5a   | fundo de botão danger      |
| `--vivest-color-surface-action-error-hover` | #e9657b   | hover de botão danger      |

---

## Cores de borda

| Token                            | Valor hex | Uso                         |
| -------------------------------- | --------- | --------------------------- |
| `--vivest-color-border-action`   | #3c2e88   | borda de ação/foco primário |
| `--vivest-color-border-focus`    | #3c2e88   | ring de foco                |
| `--vivest-color-border-error`    | #e33e5a   | borda de erro               |
| `--vivest-color-border-success`  | #1b894a   | borda de sucesso            |
| `--vivest-color-border-disabled` | #e3e3e3   | borda desabilitada          |

---

## Espaçamento

| Token                 | Valor |
| --------------------- | ----- |
| `--vivest-spacing-0`  | 0     |
| `--vivest-spacing-1`  | 4px   |
| `--vivest-spacing-2`  | 8px   |
| `--vivest-spacing-3`  | 12px  |
| `--vivest-spacing-4`  | 16px  |
| `--vivest-spacing-5`  | 20px  |
| `--vivest-spacing-6`  | 24px  |
| `--vivest-spacing-7`  | 32px  |
| `--vivest-spacing-8`  | 40px  |
| `--vivest-spacing-9`  | 48px  |
| `--vivest-spacing-10` | 64px  |

---

## Border radius

| Token                  | Valor  |
| ---------------------- | ------ |
| `--vivest-radius-0`    | 0      |
| `--vivest-radius-1`    | 4px    |
| `--vivest-radius-2`    | 8px    |
| `--vivest-radius-3`    | 12px   |
| `--vivest-radius-4`    | 16px   |
| `--vivest-radius-full` | 9999px |

---

## Exemplos

✅ Correto:

```tsx
<h1 style={{ fontFamily: 'var(--vivest-font-family-heading)', color: 'var(--vivest-color-text-heading)', fontWeight: 'var(--vivest-font-weight-semibold)' }}>
  Título
</h1>
<p style={{ fontFamily: 'var(--vivest-font-family-body)', color: 'var(--vivest-color-text-body)', fontSize: 'var(--vivest-body-md-font-size)' }}>
  Descrição
</p>
<a style={{ fontFamily: 'var(--vivest-font-family-body)', color: 'var(--vivest-color-text-action)' }}>Link</a>
```

❌ Incorreto — nunca usar hex cru ou tamanhos arbitrários:

```tsx
<h1 style={{ color: '#000000', fontSize: '32px', fontWeight: 600 }}>Título</h1>
<p style={{ color: '#5f5f5f' }}>Descrição</p>