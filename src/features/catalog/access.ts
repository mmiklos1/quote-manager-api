export const READ_CATALOG = 'read:catalog';
export const WRITE_CATALOG = 'write:catalog';

const WRITE_PREFIX = 'write:';
const READ_PREFIX = 'read:';

/** write:resource also counts as read:resource. */
export function effectiveAbilityKeys(abilityKeys: readonly string[] = []): Set<string> {
  const effective = new Set(abilityKeys);
  for (const key of abilityKeys) {
    if (key.startsWith(WRITE_PREFIX)) {
      effective.add(`${READ_PREFIX}${key.slice(WRITE_PREFIX.length)}`);
    }
  }
  return effective;
}

export function canReadCatalog({
  isSuperAdmin,
  abilityKeys,
}: {
  isSuperAdmin: boolean;
  abilityKeys?: readonly string[];
}): boolean {
  if (isSuperAdmin) {
    return true;
  }
  return effectiveAbilityKeys(abilityKeys).has(READ_CATALOG);
}

export function canWriteCatalog({
  isSuperAdmin,
  abilityKeys,
}: {
  isSuperAdmin: boolean;
  abilityKeys?: readonly string[];
}): boolean {
  if (isSuperAdmin) {
    return true;
  }
  return (abilityKeys ?? []).includes(WRITE_CATALOG);
}
