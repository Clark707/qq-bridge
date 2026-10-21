/**
 * Owner-private policy inside reserved2.
 *
 * reserved2 is the social runtime: it keeps QQ wake/read/send tools and its
 * per-conversation agent token. The owner is also the machine's agent operator,
 * so only the owner's private conversation may additionally use a full-tool
 * preset. Every group and every other private conversation keeps the restricted
 * simulation preset.
 */
export function resolveOwnerAgentPreset({
  key,
  ownerQQ,
  mode,
  ownerAgentPreset,
  simulationPreset,
} = {}) {
  const wanted = typeof ownerAgentPreset === 'string' ? ownerAgentPreset.trim() : '';
  const owner = ownerQQ === null || ownerQQ === undefined ? '' : String(ownerQQ);
  if (
    mode === 'reserved2'
    && wanted
    && owner
    && String(key) === `private:${owner}`
  ) {
    return wanted;
  }
  return simulationPreset;
}
