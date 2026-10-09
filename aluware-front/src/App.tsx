import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
);
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL as string;

type Fatura = {
  id: string;
  codigo: number;
  numero_parcela: number;
  vencimento: string;
  valor: number;
  status: "pendente" | "pago" | "cancelado";
  pago_em: string | null;
  contratos: { clientes: { nome: string } | null } | null;
};

type Mensagem = { tipo: "ok" | "erro"; texto: string } | null;

const hojeBrasilia = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

const formatarData = (d: string) => d.split("-").reverse().join("/");

const formatarValor = (v: number) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatarDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

function statusExibido(f: Fatura): "Pago" | "Pendente" | "Atrasado" | "Cancelado" {
  if (f.status === "pago") return "Pago";
  if (f.status === "cancelado") return "Cancelado";
  return f.vencimento < hojeBrasilia() ? "Atrasado" : "Pendente";
}

const cores = {
  Pago: "bg-green-100 text-green-800",
  Pendente: "bg-yellow-100 text-yellow-800",
  Atrasado: "bg-red-100 text-red-800",
  Cancelado: "bg-gray-200 text-gray-700",
};

export default function App() {
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem>(null);

  async function carregar() {
    const { data, error } = await supabase
      .from("faturas")
      .select(
        "id, codigo, numero_parcela, vencimento, valor, status, pago_em, contratos(clientes(nome))",
      )
      .order("codigo");
    if (error) {
      setMensagem({ tipo: "erro", texto: "Erro ao carregar faturas: " + error.message });
    } else {
      setFaturas(data as unknown as Fatura[]);
    }
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function simularPagamento(f: Fatura) {
    setEnviandoId(f.id);
    setMensagem(null);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fatura_id: f.id,
          valor_pago: Number(f.valor),
          evento: "PAYMENT_RECEIVED",
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setMensagem({
          tipo: "ok",
          texto: json.idempotente
            ? `Fatura #${f.codigo} já estava paga (aviso repetido ignorado).`
            : `Fatura #${f.codigo} paga com sucesso em ${json.pago_em}.`,
        });
        await carregar();
      } else {
        setMensagem({ tipo: "erro", texto: json.erro ?? `Erro ${res.status}` });
      }
    } catch {
      setMensagem({ tipo: "erro", texto: "Não foi possível chamar o webhook." });
    }
    setEnviandoId(null);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900">Faturas</h1>
        <p className="mb-4 text-sm text-gray-500">Mini-locação de motos</p>

        {mensagem && (
          <div
            className={`mb-4 rounded-lg border p-3 text-sm ${mensagem.tipo === "ok"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
              }`}
          >
            {mensagem.texto}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    Carregando...
                  </td>
                </tr>
              )}
              {!carregando && faturas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    Nenhuma fatura encontrada.
                  </td>
                </tr>
              )}
              {faturas.map((f) => {
                const st = statusExibido(f);
                return (
                  <tr key={f.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium">
                      #{f.codigo} <span className="text-gray-400">(parc. {f.numero_parcela})</span>
                    </td>
                    <td className="px-4 py-3">{f.contratos?.clientes?.nome ?? "-"}</td>
                    <td className="px-4 py-3">{formatarData(f.vencimento)}</td>
                    <td className="px-4 py-3">{formatarValor(f.valor)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cores[st]}`}>
                        {st}
                      </span>
                      {f.pago_em && (
                        <div className="mt-1 text-xs text-gray-400">{formatarDataHora(f.pago_em)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {f.status === "pendente" && (
                        <button
                          onClick={() => simularPagamento(f)}
                          disabled={enviandoId === f.id}
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {enviandoId === f.id ? "Enviando..." : "Simular Notificação de Pagamento"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}