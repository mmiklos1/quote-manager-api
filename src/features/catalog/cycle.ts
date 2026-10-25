/**
 * Edges are { requiringItemId, requiredItemId } and mean "requiring item needs required item".
 * A new edge cycles when the required item already reaches the requiring item, or the ids match.
 */
export function requirementWouldCycle(liveEdges, requiringItemId, requiredItemId) {
  if (requiringItemId === requiredItemId) {
    return true;
  }

  const nextIds = new Map();
  for (const edge of liveEdges) {
    const list = nextIds.get(edge.requiringItemId) ?? [];
    list.push(edge.requiredItemId);
    nextIds.set(edge.requiringItemId, list);
  }

  const pending = [requiredItemId];
  const seen = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === requiringItemId) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    const children = nextIds.get(current) ?? [];
    for (const child of children) {
      pending.push(child);
    }
  }
  return false;
}
