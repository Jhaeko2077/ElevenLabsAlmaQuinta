export function maskPhone(phone?: string | null): string | null {
  if (!phone) {
    return null;
  }

  const normalized = phone.replace(/\s+/g, '');

  if (normalized.length <= 4) {
    return '*'.repeat(normalized.length);
  }

  const visible = normalized.slice(-4);
  return `${'*'.repeat(Math.max(normalized.length - 4, 2))}${visible}`;
}

export function maskEmail(email?: string | null): string | null {
  if (!email) {
    return null;
  }

  const [user, domain] = email.split('@');

  if (!user || !domain) {
    return '***';
  }

  const safeUser = user.length <= 2 ? `${user[0] ?? '*'}*` : `${user[0]}${'*'.repeat(user.length - 2)}${user[user.length - 1]}`;
  const [domainName, ...rest] = domain.split('.');
  const safeDomain = domainName.length <= 2
    ? `${domainName[0] ?? '*'}*`
    : `${domainName[0]}${'*'.repeat(domainName.length - 2)}${domainName[domainName.length - 1]}`;

  return `${safeUser}@${[safeDomain, ...rest].join('.')}`;
}

export function maskApiKey(apiKey?: string | null): string | null {
  if (!apiKey) {
    return null;
  }

  if (apiKey.length <= 6) {
    return '***';
  }

  return `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`;
}

export function shortenText(value?: string | null, maxLength = 120): string | null {
  if (!value) {
    return null;
  }

  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}
