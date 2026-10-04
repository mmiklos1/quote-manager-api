export const PRODUCT_MANAGER = 'product_manager';

export function canMutateCatalog({ isSuperAdmin, grants }) {
  if (isSuperAdmin) {
    return true;
  }
  return grants.some((grant) => grant.isAdmin === true || grant.name === PRODUCT_MANAGER);
}
