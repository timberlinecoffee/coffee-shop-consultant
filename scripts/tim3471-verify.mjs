// TIM-3471 verification log lines — proves the EU geo-gate is wired into the
// Scout router. Runs entirely in-process against the pure routeScoutTurn.
import { routeScoutTurn } from "../src/lib/ai/scout-router.ts"

const cases = [
  { label: "DE + flag=true",   input: { lane: "chat_general", deepseekProdEnabled: true,  country: "DE" } },
  { label: "US + flag=true",   input: { lane: "chat_general", deepseekProdEnabled: true,  country: "US" } },
  { label: "null + flag=true", input: { lane: "chat_general", deepseekProdEnabled: true,  country: null } },
]

for (const { label, input } of cases) {
  const d = routeScoutTurn(input)
  console.log(JSON.stringify({
    tim: "TIM-3471",
    label,
    routed_provider: d.provider,
    routed_model: d.modelId,
    routed_reason: d.reason,
    metric_error_class: d.errorClass ?? null,
    metric_fallback_used: d.fallbackUsed ?? false,
  }))
}
