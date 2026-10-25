export const APP_NAME = 'Quote Manager';

export function inviteBody({ companyName, link }) {
  if (typeof companyName !== 'string' || companyName.length === 0) {
    throw new Error('companyName is required');
  }
  if (typeof link !== 'string' || link.length === 0) {
    throw new Error('link is required');
  }
  return `Your company ${companyName} has provisioned you an account on ${APP_NAME}. Please click this link to open the app and sign in. ${link}.`;
}

export function inviteFromAddress({ domainName, tld }) {
  if (typeof domainName !== 'string' || domainName.length === 0) {
    throw new Error('domainName is unset');
  }
  if (typeof tld !== 'string' || tld.length === 0) {
    throw new Error('tld is unset');
  }
  return `provisioning@${domainName}.${tld}`;
}
