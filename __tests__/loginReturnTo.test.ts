import { MAX_LOGIN_RETURN_TO_LENGTH, resolveLoginReturnTo } from "../src/features/auth/navigation/loginReturnTo";

test.each([
  "/account", "/cart", "/checkout", "/profile", "/orders", "/product/7", "/reviews/17", "/checkout-status?id=91",
])("admite el destino interno exacto %s", destination => {
  expect(resolveLoginReturnTo(destination)).toBe(destination);
});

test("normaliza un ID positivo seguro sin permitir otros parámetros", () => {
  expect(resolveLoginReturnTo("/product/0007")).toBe("/product/7");
  expect(resolveLoginReturnTo("/checkout-status?id=0007")).toBe("/checkout-status?id=7");
  expect(resolveLoginReturnTo("/reviews/9007199254740991")).toBe("/reviews/9007199254740991");
});

test.each([
  undefined, null, 7, {}, [], ["/cart"], ["/cart", "/checkout"], "", "/login", "/register", "/orders/7",
  "https://sport-center-sitie.netlify.app/cart", "https://ajeno.example", "//ajeno.example/cart", "sportcentermobile://cart", "javascript:alert(1)",
  "/cart/", "/Cart", " /cart", "/cart ", "/cart\n", "/cart#fragmento", "/cart?foo=valor", "/cart/../checkout", "/cart\\checkout",
  "%2Fcart", "/%63art", "/cart%3FreturnTo%3Dcheckout", "/product/%37", "/checkout-status?id=%37", "/checkout-status%3Fid%3D7",
  "/checkout-status?id=7&id=8", "/checkout-status?id=7&%69d=8", "/checkout-status?id[]=7", "/checkout-status?id=7&status=approved",
  "/checkout-status", "/checkout-status?id=0", "/checkout-status?id=-1", "/checkout-status?id=1.5", "/checkout-status?id=7#fragmento",
  "/product/0", "/reviews/-7", "/product/7?id=8", "/product/9007199254740992", "/reviews/99999999999999999",
  "/" + "a".repeat(MAX_LOGIN_RETURN_TO_LENGTH),
])("un destino ajeno, ambiguo o malformado vuelve a /account: %#", value => {
  expect(resolveLoginReturnTo(value)).toBe("/account");
});
