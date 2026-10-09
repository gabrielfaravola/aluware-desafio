import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: unknown, status = 200) {
    return new Response(JSON.stringify(corpo), {
        status,
        headers: { "Content-Type": "application/json", ...cors },
    });
}

function emBrasilia(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return resposta({ erro: "Use POST" }, 405);

    let corpo: any;
    try {
        corpo = await req.json();
    } catch {
        return resposta({ erro: "JSON inválido" }, 400);
    }

    const { fatura_id, valor_pago, evento } = corpo;

    if (typeof fatura_id !== "string" || typeof valor_pago !== "number") {
        return resposta({ erro: "fatura_id (texto) e valor_pago (número) são obrigatórios" }, 400);
    }

    if (evento !== "PAYMENT_RECEIVED") {
        return resposta({ ok: true, ignorado: true, motivo: "evento não tratado" });
    }

    const { data: fatura, error: erroBusca } = await supabase
        .from("faturas")
        .select("id, valor, status, pago_em")
        .eq("id", fatura_id)
        .maybeSingle();

    if (erroBusca) return resposta({ erro: "fatura_id inválido" }, 400);
    if (!fatura) return resposta({ erro: "Fatura não encontrada" }, 404);

    if (fatura.status === "pago") {
        return resposta({ ok: true, idempotente: true, pago_em: emBrasilia(fatura.pago_em) });
    }

    if (fatura.status === "cancelado") {
        return resposta({ erro: "Fatura cancelada não pode ser paga" }, 409);
    }

    if (Math.round(valor_pago * 100) !== Math.round(Number(fatura.valor) * 100)) {
        return resposta(
            { erro: "Valor pago diferente do valor da fatura", esperado: Number(fatura.valor) },
            422,
        );
    }

    const { data: atualizadas, error: erroUpdate } = await supabase
        .from("faturas")
        .update({ status: "pago", pago_em: new Date().toISOString() })
        .eq("id", fatura_id)
        .eq("status", "pendente")
        .select("pago_em");

    if (erroUpdate) return resposta({ erro: "Falha ao dar baixa" }, 500);

    if (!atualizadas || atualizadas.length === 0) {
        return resposta({ ok: true, idempotente: true });
    }

    return resposta({ ok: true, idempotente: false, pago_em: emBrasilia(atualizadas[0].pago_em) });
});