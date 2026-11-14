// JSON.parse rounds integers above 2^53 before a reviver sees them. Tokenize
// strings/numbers first so 64-bit addresses remain exact decimal strings.
// Safe integers stay numbers for compatibility with journal BodyID handling.
export function parseJsonPreservingIntegers(text) {
  const protectedText = text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) => {
    if (token.startsWith('"') || /[.eE]/.test(token)) return token;
    return Number.isSafeInteger(Number(token)) ? token : JSON.stringify(token);
  });
  return JSON.parse(protectedText);
}

export function systemAddressString(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const text = String(value);
  if (!/^(0|[1-9]\d{0,19})$/.test(text) || BigInt(text) > 18446744073709551615n) return null;
  return text;
}
