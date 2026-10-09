-- ===== TABELAS =====
create table clientes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  cpf        text not null unique,
  criado_em  timestamptz not null default now()
);

create table veiculos (
  id         uuid primary key default gen_random_uuid(),
  placa      text not null unique,
  modelo     text not null,
  criado_em  timestamptz not null default now()
);

create table contratos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id),
  veiculo_id     uuid not null references veiculos(id),
  valor_semanal  numeric(10,2) not null check (valor_semanal > 0),
  total_semanas  integer not null check (total_semanas > 0),
  data_inicio    date not null,
  status         text not null default 'ativo'
                 check (status in ('ativo', 'encerrado', 'cancelado')),
  criado_em      timestamptz not null default now()
);

create table faturas (
  id               uuid primary key default gen_random_uuid(),
  codigo           bigint generated always as identity,
  contrato_id      uuid not null references contratos(id),
  numero_parcela   integer not null check (numero_parcela > 0),
  vencimento       date not null,
  valor            numeric(10,2) not null check (valor > 0),
  status           text not null default 'pendente'
                   check (status in ('pendente', 'pago', 'cancelado')),
  pago_em          timestamptz,
  criado_em        timestamptz not null default now(),
  unique (contrato_id, numero_parcela)
);

-- ===== TRIGGER 1: gera as faturas ao inserir contrato ativo =====
create or replace function gerar_faturas()
returns trigger
language plpgsql
as $$
begin
  insert into faturas (contrato_id, numero_parcela, vencimento, valor)
  select
    NEW.id,
    n,
    NEW.data_inicio + (n - 1) * 7,
    NEW.valor_semanal
  from generate_series(1, NEW.total_semanas) as n;

  return NEW;
end;
$$;

create trigger trg_gerar_faturas
after insert on contratos
for each row
when (NEW.status = 'ativo')
execute function gerar_faturas();

-- ===== TRIGGER 2: protege fatura paga =====
create or replace function proteger_fatura_paga()
returns trigger
language plpgsql
as $$
begin
  if OLD.status = 'pago' then

    if NEW.valor <> OLD.valor then
      raise exception 'Fatura paga não pode ter o valor alterado';
    end if;

    if NEW.status = 'cancelado' then
      raise exception 'Fatura paga não pode ser cancelada';
    end if;

  end if;

  return NEW;
end;
$$;

create trigger trg_proteger_fatura_paga
before update on faturas
for each row
execute function proteger_fatura_paga();

-- ===== RLS: leitura pública para a tela =====
alter table faturas   enable row level security;
alter table contratos enable row level security;
alter table clientes  enable row level security;

create policy "leitura publica faturas"   on faturas   for select to anon using (true);
create policy "leitura publica contratos" on contratos for select to anon using (true);
create policy "leitura publica clientes"  on clientes  for select to anon using (true);