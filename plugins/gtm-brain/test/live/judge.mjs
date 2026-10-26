// An LLM as the judge of an answer or a proposal, when a key is present. The key comes from
// OPENAI_API_KEY, or from <repository>/work/openai.key, which git ignores: the key never enters a
// chat transcript. Deterministic checks decide pass or fail on state and route; the judge reads.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const keyFile = fileURLToPath(new URL("../../../../work/openai.key", import.meta.url));
// The key file is the bare key, or KEY=value lines (OPENAI_API_KEY, OPENAI_JUDGE_MODEL), quotes allowed.
const keyFileValues = () => { if (!existsSync(keyFile)) return {}; const out = {}; for (const line of readFileSync(keyFile, "utf8").split("\n")) { const m = line.trim().match(/^([A-Z_]+)=\s*["\x27]?([^"\x27]*)["\x27]?$/); if (m) out[m[1]] = m[2].trim(); else if (line.trim() && !out.OPENAI_API_KEY) out.OPENAI_API_KEY = line.trim(); } return out; };
export const judgeKey = () => process.env.OPENAI_API_KEY || keyFileValues().OPENAI_API_KEY || "";
export const judgeModel = () => process.env.OPENAI_JUDGE_MODEL || keyFileValues().OPENAI_JUDGE_MODEL || "gpt-4.1";

/* ask for a JSON verdict; `shape` names the fields the verdict must have */
export async function judge(instructions, evidence, shape) {
  const key = judgeKey(); if (!key) return { skipped: "no OPENAI_API_KEY and no work/openai.key" };
  const content = `${instructions}\n\n${evidence}\n\nReply with JSON only, exactly these fields: ${shape}. Use only the regular hyphen (-) in text.`;
  let r; try { r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ model: judgeModel(), temperature: 0, messages: [{ role: "user", content }], response_format: { type: "json_object" } }) }); }
  catch (e) { return { error: `judge unreachable: ${String(e.message).replaceAll(key, "<key>")}` }; }
  if (!r.ok) return { error: `judge ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const j = await r.json(); try { return { model: judgeModel(), ...JSON.parse(j.choices[0].message.content) }; } catch { return { error: "judge answered without JSON" }; }
}
