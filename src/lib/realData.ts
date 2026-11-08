// Real market data through the site's own Databento account is limited to the
// people listed in DATA_OWNER_EMAILS (the data is licensed for their own use).
// Everyone else can load real data with their own Databento key.

export function dataOwnerEmails(): string[] {
  return (process.env.DATA_OWNER_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

/** True when the site has its own Databento key and at least one owner listed. */
export function ownerDataEnabled(): boolean {
  return Boolean(process.env.DATABENTO_API_KEY) && dataOwnerEmails().length > 0;
}

export function isDataOwner(email: string | null | undefined): boolean {
  return Boolean(email) && dataOwnerEmails().includes(String(email).toLowerCase());
}
