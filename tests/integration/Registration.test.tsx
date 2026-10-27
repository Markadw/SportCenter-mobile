import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import axiosClient from "../../src/api/axios";
import { RegisterScreen } from "../../src/features/registration/screens/RegisterScreen";
import { VerifyEmailScreen } from "../../src/features/registration/screens/VerifyEmailScreen";
import { httpError, registrationForm } from "../../__tests__/fixtures/registration";

const mockReplace = jest.fn();
let mockParams: { email?: string | string[] } = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("../../src/api/axios", () => ({ __esModule: true, default: { post: jest.fn() } }));
const post = jest.mocked(axiosClient.post);

async function fillRegistration() {
  for (const [label, value] of [
    ["Nombre", registrationForm.nombre], ["Apellido paterno", registrationForm.aPaterno],
    ["Apellido materno", registrationForm.aMaterno], ["Correo electrónico", " CLIENTE@EXAMPLE.TEST "],
    ["Teléfono", registrationForm.telefono], ["Contraseña", registrationForm.passw],
    ["Confirmar contraseña", registrationForm.confirmPassword],
  ]) await fireEvent.changeText(screen.getByLabelText(label), value);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => { mockParams = {}; post.mockReset(); });

describe("CP-01 / HU-01: pantallas, ViewModels y servicio con transporte simulado", () => {
  test("recorre registro y verificación con el código escrito, sin crear una sesión", async () => {
    post.mockResolvedValueOnce({ data: { id_usuario: 7, email: registrationForm.email,
      passw: "hash-ficticio", token_verificacion: "123456" } });
    const view = await render(<RegisterScreen />);
    await fillRegistration();
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/verify-email", params: { email: registrationForm.email },
    }));
    expect(screen.getByLabelText("Contraseña").props.value).toBe("");
    expect(screen.getByLabelText("Confirmar contraseña").props.value).toBe("");
    expect(screen.queryByText("123456")).toBeNull();
    await view.unmount();
    mockParams = { email: registrationForm.email };
    post.mockResolvedValueOnce({ data: { message: "Cuenta verificada correctamente." } });
    await render(<VerifyEmailScreen />);
    await fireEvent.changeText(screen.getByLabelText("Código de verificación"), "654321");
    await fireEvent.press(screen.getByRole("button", { name: "Verificar cuenta" }));
    await waitFor(() => expect(screen.getByText("Cuenta verificada")).toBeTruthy());
    expect(post.mock.calls[1][1]).toEqual({ email: registrationForm.email, token: "654321" });
    expect(post).toHaveBeenCalledTimes(2);
    expect(mockReplace).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Volver a la tienda" }));
    expect(mockReplace).toHaveBeenLastCalledWith("/");
  });

  test("muestra y oculta cada contraseña de forma independiente sin modificar los datos", async () => {
    await render(<RegisterScreen />);
    await fillRegistration();
    expect(screen.getByLabelText("Contraseña").props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText("Confirmar contraseña").props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Mostrar: Contraseña" }));
    expect(screen.getByLabelText("Contraseña").props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText("Confirmar contraseña").props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Mostrar: Confirmar contraseña" }));
    expect(screen.getByLabelText("Confirmar contraseña").props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Ocultar: Contraseña" }));
    await fireEvent.press(screen.getByRole("button", { name: "Ocultar: Confirmar contraseña" }));
    expect(screen.getByLabelText("Contraseña").props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText("Confirmar contraseña").props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText("Contraseña").props.value).toBe(registrationForm.passw);
    expect(screen.getByLabelText("Confirmar contraseña").props.value).toBe(registrationForm.confirmPassword);
    expect(post).not.toHaveBeenCalled();
  });

  test("al salir y volver al registro comienza con contraseñas vacías y ocultas", async () => {
    const view = await render(<RegisterScreen />);
    await fillRegistration();
    await fireEvent.press(screen.getByRole("button", { name: "Mostrar: Contraseña" }));
    await fireEvent.press(screen.getByRole("button", { name: "Mostrar: Confirmar contraseña" }));
    await view.unmount();
    await render(<RegisterScreen />);
    expect(screen.getByLabelText("Contraseña").props.value).toBe("");
    expect(screen.getByLabelText("Confirmar contraseña").props.value).toBe("");
    expect(screen.getByLabelText("Contraseña").props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText("Confirmar contraseña").props.secureTextEntry).toBe(true);
  });

  test("explica un fallo de envío de correo sin mostrar detalles internos", async () => {
    post.mockRejectedValueOnce(httpError("Revisa que tu información sea correcta. Intenta de nuevo 1.Error SMTP: dato-interno"));
    await render(<RegisterScreen />);
    await fillRegistration();
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() => expect(screen.getByText("El servidor no pudo enviar el correo de verificación. Inténtalo más tarde.")).toBeTruthy());
    expect(screen.queryByText(/SMTP|dato-interno/)).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test("campos vacíos y contraseñas diferentes no llegan al servidor", async () => {
    await render(<RegisterScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(screen.getByText("Escribe tu nombre.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
    await fillRegistration();
    await fireEvent.changeText(screen.getByLabelText("Confirmar contraseña"), "OtraClave2026!");
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeTruthy();
    expect(post).not.toHaveBeenCalled();
  });

  test("explica el conflicto de correo o teléfono y permite corregirlo", async () => {
    post.mockRejectedValueOnce(httpError("Revisa que tu información sea correcta. Intenta de nuevo"));
    await render(<RegisterScreen />);
    await fillRegistration();
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() => expect(screen.getByText("Ya existe una cuenta con ese correo o teléfono. Si aún no verificaste tu cuenta, usa «Ya tengo un código».")).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText("Teléfono"), "7717654321");
    expect(screen.queryByText("Ya existe una cuenta con ese correo o teléfono. Si aún no verificaste tu cuenta, usa «Ya tengo un código».")).toBeNull();
    post.mockResolvedValueOnce({ data: { id_usuario: 8, email: registrationForm.email } });
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][1]).toMatchObject({ telefono: "7717654321" });
  });

  test("bloquea el doble envío por botón o teclado mientras espera respuesta", async () => {
    const response = deferred<{ data: { id_usuario: number; email: string } }>();
    post.mockReturnValueOnce(response.promise);
    await render(<RegisterScreen />);
    await fillRegistration();
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(screen.getByRole("button", { name: "Crear cuenta" }).props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    await fireEvent(screen.getByLabelText("Confirmar contraseña"), "submitEditing");
    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Correo electrónico").props.editable).toBe(false);
    await act(async () => response.resolve({ data: { id_usuario: 7, email: registrationForm.email } }));
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  test("un timeout no repite registro y permite continuar con el código recibido", async () => {
    post.mockRejectedValueOnce({ isAxiosError: true, code: "ECONNABORTED" });
    await render(<RegisterScreen />);
    await fillRegistration();
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() => expect(screen.getByText(/No pudimos confirmar el registro/)).toBeTruthy());
    expect(post).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Ya tengo un código" }));
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/verify-email", params: { email: registrationForm.email } });
    expect(screen.getByLabelText("Contraseña").props.value).toBe("");
  });

  test("salir del registro cancela la espera e impide una navegación tardía", async () => {
    const response = deferred<{ data: { id_usuario: number; email: string } }>();
    post.mockReturnValueOnce(response.promise);
    const view = await render(<RegisterScreen />);
    await fillRegistration();
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    const signal = post.mock.calls[0][2]?.signal;
    await view.unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => response.resolve({ data: { id_usuario: 7, email: registrationForm.email } }));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test("una entrada directa a verificación exige correo y seis dígitos", async () => {
    await render(<VerifyEmailScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Verificar cuenta" }));
    expect(screen.getByText("Escribe tu correo.")).toBeTruthy();
    expect(screen.getByText("Escribe el código de 6 dígitos.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), registrationForm.email);
    await fireEvent.changeText(screen.getByLabelText("Código de verificación"), "abcdef");
    await fireEvent.press(screen.getByRole("button", { name: "Verificar cuenta" }));
    expect(post).not.toHaveBeenCalled();
  });

  test.each([
    ["El token es incorrecto. Te quedan 2 intentos.", "Código incorrecto. Intentos restantes: 2."],
    ["El token ha expirado, solicita uno nuevo.", "El código venció. Solicita uno nuevo."],
    ["Has agotado los intentos. Solicita un nuevo token.", "Se agotaron los intentos. Solicita un código nuevo."],
  ])("muestra %s y permite solicitar otro código", async (message, expected) => {
    mockParams = { email: registrationForm.email };
    post.mockRejectedValueOnce(httpError(message));
    await render(<VerifyEmailScreen />);
    await fireEvent.changeText(screen.getByLabelText("Código de verificación"), "654321");
    await fireEvent.press(screen.getByRole("button", { name: "Verificar cuenta" }));
    await waitFor(() => expect(screen.getByText(expected)).toBeTruthy());
    post.mockResolvedValueOnce({ data: { message: "Codigo enviado correctamente. Revise su bandeja de entrada." } });
    await fireEvent.press(screen.getByRole("button", { name: "Reenviar código" }));
    await waitFor(() => expect(screen.getByText(/Enviamos un código nuevo/)).toBeTruthy());
    expect(screen.getByLabelText("Código de verificación").props.value).toBe("");
    expect(screen.queryByText(expected)).toBeNull();
    expect(post.mock.calls[1][1]).toEqual({ email: registrationForm.email });
  });

  test("reenvío y verificación comparten bloqueo y no compiten entre sí", async () => {
    mockParams = { email: registrationForm.email };
    const response = deferred<{ data: { message: string } }>();
    post.mockReturnValueOnce(response.promise);
    await render(<VerifyEmailScreen />);
    await fireEvent.changeText(screen.getByLabelText("Código de verificación"), "654321");
    await fireEvent.press(screen.getByRole("button", { name: "Reenviar código" }));
    await fireEvent.press(screen.getByRole("button", { name: "Verificar cuenta" }));
    await fireEvent(screen.getByLabelText("Código de verificación"), "submitEditing");
    expect(post).toHaveBeenCalledTimes(1);
    await act(async () => response.resolve({ data: { message: "Codigo enviado correctamente. Revise su bandeja de entrada." } }));
    expect(screen.getByLabelText("Código de verificación").props.value).toBe("");
  });

  test("un correo ambiguo en la URL no se elige arbitrariamente", async () => {
    mockParams = { email: ["uno@example.test", "otro@example.test"] };
    await render(<VerifyEmailScreen />);
    expect(screen.getByLabelText("Correo electrónico").props.value).toBe("");
    await fireEvent.press(screen.getByRole("button", { name: "Reenviar código" }));
    expect(post).not.toHaveBeenCalled();
  });

  test("cambiar correo descarta el código asociado al correo anterior", async () => {
    mockParams = { email: registrationForm.email };
    await render(<VerifyEmailScreen />);
    await fireEvent.changeText(screen.getByLabelText("Código de verificación"), "654321");
    await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), "otro@example.test");
    expect(screen.getByLabelText("Código de verificación").props.value).toBe("");
  });
});
