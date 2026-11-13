// V3.5N: side-effect-free generation readiness qualification. Never clears a HOLD.
export async function qualifyGenerationReadiness({ dataRoot, latest, strict, reader }) {
  if (typeof reader !== 'function') throw new Error('generation_readiness_reader_required');
  const day = String(latest?.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: !strict, mode: 'NO_LATEST', reason: 'latest_missing' };
  }
  try {
    const result = await reader({dataRoot, day, latest, strict});
    if (result?.mode === 'PINNED') {
      return { ok: true, mode: 'PINNED', day, ref: result.ref, generation: result.generation };
    }
    if (result?.mode === 'LEGACY' && !strict) return { ok: true, mode: 'LEGACY', day };
    return { ok: false, mode: 'HOLD', day, reason: 'generation_required' };
  } catch (error) {
    return { ok: false, mode: 'HOLD', day, reason: String(error?.message || 'generation_invalid') };
  }
}
