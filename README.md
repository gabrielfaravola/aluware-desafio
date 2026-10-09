# AluWare - Mini-Locação com Webhook

Módulo de locação de motos: o banco gera as faturas semanais quando um contrato ativo é criado, e um webhook recebe a confirmação de pagamento (Pix) e dá baixa na fatura.

- Tela: https://aluware-desafio.vercel.app
- Webhook: https://fegcwedpqiwiwzfffbtr.supabase.co/functions/v1/rapid-processor

Stack: PostgreSQL (Supabase), Edge Function (Deno + TypeScript), React + TypeScript + Tailwind (Vite).

## Estrutura

```
sql/schema.sql                              tabelas, triggers, constraints e policies
supabase/functions/webhook-pagamento/       Edge Function
aluware-front/                              tela
```

No painel do Supabase a função está com o nome `rapid-processor`.

## Como rodar

**Banco:** crie um projeto no Supabase e rode `sql/schema.sql` no SQL Editor.

**Webhook:** crie uma Edge Function com o conteúdo de `supabase/functions/webhook-pagamento/index.ts` e desligue o "Verify JWT" nas configurações dela (o gateway não envia token do Supabase).

**Tela:**

```bash
cd aluware-front
cp .env.example .env   # preencha as 3 variáveis
npm install
npm run dev
```

Variáveis: `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (publishable key) e `VITE_WEBHOOK_URL`.

**Dados de teste:**

```sql
insert into clientes (nome, cpf) values ('João Teste', '12345678900');
insert into veiculos (placa, modelo) values ('ABC1234', 'Honda CG 160');

insert into contratos (cliente_id, veiculo_id, valor_semanal, total_semanas, data_inicio)
select c.id, v.id, 400.00, 4, '2026-10-10'
from clientes c, veiculos v limit 1;
```

## Testando o webhook

```bash
curl -X POST https://fegcwedpqiwiwzfffbtr.supabase.co/functions/v1/rapid-processor \
  -H "Content-Type: application/json" \
  -d '{"fatura_id":"ID-DA-FATURA","valor_pago":400,"evento":"PAYMENT_RECEIVED"}'
```

Respostas:

- 200, `idempotente: false`: baixa feita
- 200, `idempotente: true`: aviso repetido, nada foi alterado
- 422: valor diferente do da fatura
- 404: fatura não encontrada
- 409: fatura cancelada
- 400: corpo inválido

## Decisões

- **Vencimento:** a parcela 1 vence na data de início do contrato e as demais a cada 7 dias (`data_inicio + (n - 1) * 7`).
- **Faturas no banco:** trigger `AFTER INSERT` em `contratos`, só para status `ativo`, usando `generate_series`. `unique (contrato_id, numero_parcela)` evita parcela duplicada.
- **Fatura paga:** trigger `BEFORE UPDATE` em `faturas` que recusa alteração de valor ou cancelamento quando o status anterior é `pago`.
- **Baixa atômica e idempotência:** o webhook faz um único `update ... where id = ? and status = 'pendente'`. Se dois avisos chegarem juntos, só um atualiza; o outro afeta zero linhas e responde 200.
- **Fuso:** `pago_em` é `timestamptz` (instante exato) e é exibido em `America/Sao_Paulo` no webhook e na tela.
- **Valores:** `numeric(10,2)`, e a comparação no webhook é feita em centavos.
- **Atrasado:** não é status no banco. A tela mostra "Atrasado" quando a fatura está pendente e o vencimento é anterior a hoje.

## Segurança e limitações

- A service role key só é lida dentro da Edge Function (`Deno.env`). O front usa só a publishable key, com RLS e leitura apenas; em `clientes` o acesso anônimo é limitado a `id` e `nome`.
- O webhook não autentica o remetente. Em produção ele deveria validar um token enviado pelo gateway (o Asaas envia um no header).
- Clientes, veículos e contratos são cadastrados por SQL; não há tela de cadastro.
