import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import axiosClient from "../src/api/axios";
import { PasswordRecoveryScreen } from "../src/features/passwordRecovery/screens/PasswordRecoveryScreen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ Stack: { Screen: () => null }, useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }) }));
jest.mock("lucide-react-native", () => Object.fromEntries(["ArrowLeft", "ChevronLeft", "Eye", "EyeOff", "KeyRound", "LockKeyhole", "Mail", "MailCheck", "RefreshCw", "Send"].map(name => [name, () => null])));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("../src/api/axios", () => ({ __esModule: true, default: { post: jest.fn() } }));
const post = jest.mocked(axiosClient.post);
beforeEach(() => post.mockReset());

test("un correo inválido no envía la solicitud", async () => {
  await render(<PasswordRecoveryScreen />);
  await fireEvent.changeText(screen.getByLabelText("Correo"), "no-es-correo");
  await fireEvent.press(screen.getByRole("button", { name: "Enviar código" }));
  expect(post).not.toHaveBeenCalled();
});

test("envía el código a /users/verify-user-email una sola vez y pasa al restablecimiento", async () => {
  let resolve!: (value: unknown) => void;
  post.mockReturnValueOnce(new Promise(r => { resolve = r; }) as never);
  await render(<PasswordRecoveryScreen />);
  await fireEvent.changeText(screen.getByLabelText("Correo"), " Cliente@Example.test ");
  await fireEvent.press(screen.getByRole("button", { name: "Enviar código" }));
  await fireEvent.press(screen.getByRole("button", { name: "Enviar código" }));
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][0]).toBe("/users/verify-user-email");
  expect(post.mock.calls[0][1]).toEqual({ email: "cliente@example.test" });
  resolve({ data: { message: "Código enviado" } });
  await waitFor(() => expect(screen.getByLabelText("Código de recuperación")).toBeTruthy());
});

const NEW_PASSWORD = "NuevaClave#2026";
const axiosError = (message: string) => ({ isAxiosError: true, response: { status: 400, data: { message } } });
async function openCodeStep() {
  await render(<PasswordRecoveryScreen />);
  await fireEvent.changeText(screen.getByLabelText("Correo"), "cliente@example.test");
  await fireEvent.press(screen.getByRole("button", { name: "Introducir código de recuperación" }));
}
async function toPasswordStep(code = "123456") {
  await openCodeStep();
  await fireEvent.changeText(screen.getByLabelText("Código de recuperación"), code);
  await fireEvent.press(screen.getByRole("button", { name: "Continuar" }));
  await fireEvent.changeText(screen.getByLabelText("Nueva contraseña"), NEW_PASSWORD);
  await fireEvent.changeText(screen.getByLabelText("Confirmar contraseña"), NEW_PASSWORD);
}

test("paso 2: el correo es de solo lectura y «Continuar» valida sólo el formato, sin peticiones", async () => {
  await openCodeStep();
  expect(screen.getByText("Paso 2 de 3")).toBeTruthy();
  expect(screen.getByLabelText("Correo").props.editable).toBe(false);
  await fireEvent.changeText(screen.getByLabelText("Código de recuperación"), "12a4");
  expect(screen.getByLabelText("Código de recuperación").props.value).toBe("124");
  await fireEvent.press(screen.getByRole("button", { name: "Continuar" }));
  expect(screen.getByText("Escribe los 6 dígitos del código.")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Código de recuperación"), "123 456");
  await fireEvent.press(screen.getByRole("button", { name: "Continuar" }));
  expect(screen.getByText("Paso 3 de 3")).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
});

test("paso 3: «Volver al código» conserva el código y «Cambiar correo» vuelve al paso 1", async () => {
  await toPasswordStep("654321");
  await fireEvent.press(screen.getByRole("button", { name: "Volver al código" }));
  expect(screen.getByLabelText("Código de recuperación").props.value).toBe("654321");
  await fireEvent.press(screen.getByRole("button", { name: "Cambiar correo" }));
  expect(screen.getByText("Paso 1 de 3")).toBeTruthy();
  expect(screen.getByLabelText("Correo").props.value).toBe("cliente@example.test");
  expect(post).not.toHaveBeenCalled();
});

test("actualiza enviando correo, código y contraseña juntos y sólo entonces muestra éxito", async () => {
  post.mockResolvedValueOnce({ data: { message: "Contraseña actualizada correctamente." } });
  await toPasswordStep("654321");
  expect(screen.queryByText("Contraseña actualizada")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Actualizar contraseña" }));
  await waitFor(() => expect(screen.getByText("Contraseña actualizada")).toBeTruthy());
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][0]).toBe("/users/reset-psw");
  expect(post.mock.calls[0][1]).toEqual({ email: "cliente@example.test", psw: NEW_PASSWORD, token: "654321" });
  expect(post.mock.calls.some(([url]) => url === "/users/verify-email" || url === "/users/verify-user-token")).toBe(false);
});

test("un código incorrecto muestra el error real y regresa al paso 2", async () => {
  post.mockRejectedValueOnce(axiosError("El token es incorrecto. Te quedan 2 intentos."));
  await toPasswordStep();
  await fireEvent.press(screen.getByRole("button", { name: "Actualizar contraseña" }));
  await waitFor(() => expect(screen.getByText("Código incorrecto. Intentos restantes: 2.")).toBeTruthy());
  expect(screen.getByText("Paso 2 de 3")).toBeTruthy();
  expect(screen.getByLabelText("Código de recuperación").props.value).toBe("123456");
});

test("una contraseña igual a la anterior muestra el error y permanece en el paso 3", async () => {
  post.mockRejectedValueOnce(axiosError("La nueva contraseña no puede ser igual a la actual."));
  await toPasswordStep();
  await fireEvent.press(screen.getByRole("button", { name: "Actualizar contraseña" }));
  await waitFor(() => expect(screen.getByText("La nueva contraseña no puede ser igual a la actual.")).toBeTruthy());
  expect(screen.getByText("Paso 3 de 3")).toBeTruthy();
});

test("«Introducir código de recuperación» no envía nada y se puede volver a login", async () => {
  await openCodeStep();
  expect(screen.getByLabelText("Código de recuperación")).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("link", { name: "Volver a iniciar sesión" }));
  expect(mockPush).toHaveBeenCalledWith("/login");
});


test("pegar un OTP con espacios conserva los seis dígitos antes de continuar sin consumirlo", async () => {
  await openCodeStep();
  const input = screen.getByLabelText("Código de recuperación");
  const clipboard = "012 345";
  // React Native aplica maxLength antes de emitir onChangeText.
  await fireEvent.changeText(input, clipboard.slice(0, input.props.maxLength ?? clipboard.length));
  expect(screen.getByLabelText("Código de recuperación").props.value).toBe("012345");
  await fireEvent.press(screen.getByRole("button", { name: "Continuar" }));
  expect(screen.getByText("Paso 3 de 3")).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
});
