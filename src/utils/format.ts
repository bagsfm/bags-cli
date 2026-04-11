export function lamportsToSol(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(9);
}

export function shortAddress(value: string): string {
  if (value.length < 10) {
    return value;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) {
    return apiKey;
  }
  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
}
