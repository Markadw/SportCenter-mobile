import { canRequestAccountDeletion } from "../src/features/account-deletion/eligibility";
const token = (payload: unknown) => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}.signature`;
test("el autoservicio se muestra sólo a un cliente identificable; el servidor sigue autorizando", () => {
  expect(canRequestAccountDeletion(token({ rol: 1, id_usuario: 17 }))).toBe(true);
  for (const value of [undefined, "invalid", token({ rol: 2, id_usuario: 17 }), token({ rol: "1", id_usuario: 17 }), token({ rol: 1, id_usuario: "17" }), token({ rol: 1, id_usuario: 0 }), token([]), "a".repeat(17000)]) {
    expect(canRequestAccountDeletion(value)).toBe(false);
  }
});
