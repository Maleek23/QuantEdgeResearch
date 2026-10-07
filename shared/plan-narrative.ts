/** Remove stale first-target claims that contradict the persisted plan. */
export function stripConflictingTargetClaims(text: string | undefined, canonicalTarget?: number | null): string {
  let result = String(text ?? '');
  const target = Number(canonicalTarget);
  if (Number.isFinite(target) && target > 0) {
    result = result.replace(/\bT1\s+\$([\d,]+(?:\.\d+)?)[^;.!?]*(?:[;.]?)/gi, (claim, rawPrice: string) => {
      const price = Number(rawPrice.replaceAll(',', ''));
      return Number.isFinite(price) && Math.abs(price - target) <= 0.01 ? claim : '';
    });
    result = result.replace(/\bformula\s+(?:T1|target)\s+(?:was|is|would\s+be)\s+\$[\d,]+(?:\.\d+)?\.?/gi, '');
  } else {
    result = result.replace(/\bT1\s+\$[\d,]+(?:\.\d+)?[^;.!?]*\b(?:\d+(?:\.\d+)?R)[^;.!?]*[;.]?/gi, '');
    result = result.replace(/\bformula\s+(?:T1|target)\s+(?:was|is|would\s+be)\s+\$[\d,]+(?:\.\d+)?\.?/gi, '');
  }
  return result.replace(/\s+([;,.])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}
