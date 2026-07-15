# Configurador PREV

Aplicação para parametrização de regras de contribuição de planos de previdência complementar.

## Desenvolvimento do frontend

```bash
npm install
npm run dev
```

O servidor do Vite executa somente o frontend. Para validar as funções e as variáveis do projeto Vercel localmente, vincule a pasta ao projeto e use o ambiente de desenvolvimento da Vercel.

## Variáveis de ambiente

O backend requer `DATABASE_URL`. A integração de cálculo usa `auth_api_cpf`,
`auth_api_password` e `OCP_API_CALCULO`. Use `.env.example` como referência e
nunca exponha essas variáveis com o prefixo `VITE_`.

## API de cálculo de investimento

O endpoint `POST /api/calcular-investimento` autentica na Vivest e encaminha os
dados abertos da simulação para a API de cálculo. A resposta mantém o contrato da
API externa, pronta para ser consumida pelo futuro front de simulação.

O endpoint `POST /api/simular-investimento` recebe os dados do participante,
aplica as regras de contribuição e de elegibilidade do plano e usa o resultado
para chamar a API aberta. Para contribuições configuradas como faixa, o mínimo é
usado quando o participante não informa uma escolha.

## Validação

```bash
npm run lint
npm run build
```
