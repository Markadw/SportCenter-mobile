// Tokens sintéticos para namespace local. La firma es ficticia y nunca autoriza una API real.
export function syntheticReviewSessionToken(userId: number, sessionId: string, sequence = 1): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return encode({ alg: "HS256", typ: "JWT" }) + "." + encode({ id_usuario: userId, sessionId, iat: sequence }) + ".synthetic-not-a-signature";
}
