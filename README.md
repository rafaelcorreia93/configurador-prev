# Configurador PREV

Aplicação para parametrização de regras de contribuição de planos de previdência complementar.

## Desenvolvimento do frontend

```bash
npm install
npm run dev
```

O servidor do Vite executa somente o frontend. Para validar as funções e as variáveis do projeto Vercel localmente, vincule a pasta ao projeto e use o ambiente de desenvolvimento da Vercel.

## Variáveis de ambiente

O backend requer `DATABASE_URL`. Use `.env.example` como referência e nunca exponha a conexão com o prefixo `VITE_`.

## Validação

```bash
npm run lint
npm run build
```
