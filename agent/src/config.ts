// Agent config. Every value comes from agent/.env (see .env.example).

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} in agent/.env (see .env.example)`)
  return value
}

const optional = (name: string) => process.env[name] || undefined

export const config = {
  rpcUrl: required('NEAR_RPC_URL'),
  explorerTxUrl: required('NEAR_EXPLORER_TX_URL'),
  leashAccount: required('LEASH_ACCOUNT'),
  /** The agent's function-call key (ed25519:...). Can call agent_spend only. */
  agentSecretKey: required('AGENT_SECRET_KEY'),
  callGas: BigInt(required('GAS_CALL_TGAS')) * 10n ** 12n,
  /** Give up on a NEAR call after this long (the client's own retries included). */
  nearTimeoutMs: Number(required('NEAR_TIMEOUT_MS')),
  nearRetries: Number(required('NEAR_RETRIES')),
  llm: {
    baseUrl: optional('LLM_BASE_URL'),
    apiKey: optional('LLM_API_KEY'),
    model: optional('LLM_MODEL'),
    maxTurns: Number(optional('AGENT_MAX_TURNS') ?? '6'),
    timeoutMs: Number(optional('LLM_TIMEOUT_MS') ?? '60000'),
    maxTokens: optional('LLM_MAX_TOKENS') ? Number(optional('LLM_MAX_TOKENS')) : undefined,
    reasoningEffort: optional('LLM_REASONING_EFFORT'),
  },
}

export function llmConfig() {
  const { baseUrl, apiKey, model, maxTurns, timeoutMs, maxTokens, reasoningEffort } = config.llm
  if (!baseUrl || !apiKey || !model) {
    throw new Error('Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL in agent/.env to run the LLM agent')
  }
  return { baseUrl, apiKey, model, maxTurns, timeoutMs, maxTokens, reasoningEffort }
}

/** Accounts used by the attack scripts. */
export function attackConfig() {
  return {
    attacker: required('ATTACKER_ACCOUNT'),
    merchant: required('MERCHANT_ACCOUNT'),
    dripAmountNear: required('DRIP_AMOUNT_NEAR'),
    dripMaxAttempts: Number(required('DRIP_MAX_ATTEMPTS')),
    otherContract: required('OTHER_CONTRACT_ACCOUNT'),
  }
}
