import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { useEffect, useState } from "react";
import axiosClient from "../../src/api/axios";
import { AppHeader } from "../../src/components/AppHeader";
import { SessionProvider } from "../../src/features/auth/context/SessionContext";
import { AccountScreen } from "../../src/features/auth/screens/AccountScreen";
import { LoginScreen } from "../../src/features/auth/screens/LoginScreen";
import { RegisterScreen } from "../../src/features/registration/screens/RegisterScreen";
import { VerifyEmailScreen } from "../../src/features/registration/screens/VerifyEmailScreen";
import { loginResponse } from "../../__tests__/fixtures/auth";
import { registrationForm } from "../../__tests__/fixtures/registration";

type Target = string | { pathname: string; params?: Record<string, string> };
let mockNavigate: ((target: Target) => void) | undefined;
let mockParams: Record<string, string> = {};
let mockHistory: string[] = [];
const mockPath = (target: Target) => typeof target === "string" ? target : target.pathname;
const mockPush = jest.fn((target: Target) => {
  mockHistory.push(mockPath(target));
  mockNavigate?.(target);
});
const mockReplace = jest.fn((target: Target) => {
  mockHistory.splice(-1, 1, mockPath(target));
  mockNavigate?.(target);
});
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    const { useEffect: effectHook } = jest.requireActual("react");
    effectHook(effect, [effect]);
  },
  Redirect: ({ href }: { href: string }) => {
    const { useEffect: effectHook } = jest.requireActual("react");
    effectHook(() => { mockReplace(href); }, [href]);
    return null;
  },
}));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("lucide-react-native", () => ({ Search: () => null, ShoppingBag: () => null, User: () => null }));

function Flow() {
  const [path, setPath] = useState("/login");
  useEffect(() => {
    mockNavigate = (target) => {
      mockParams = typeof target === "string" ? {} : target.params ?? {};
      setPath(typeof target === "string" ? target : target.pathname);
    };
    return () => { mockNavigate = undefined; };
  }, []);
  const content = path === "/register" ? <RegisterScreen />
    : path === "/verify-email" ? <VerifyEmailScreen />
      : path === "/account" ? <AccountScreen /> : <LoginScreen />;
  return <><AppHeader />{content}</>;
}

const originalAdapter = axiosClient.defaults.adapter;
let adapter: jest.MockedFunction<AxiosAdapter>;
function response(config: InternalAxiosRequestConfig, data: unknown) {
  return { config, data, status: 201, statusText: "Created", headers: new AxiosHeaders() };
}
beforeEach(() => {
  mockParams = {};
  mockHistory = ["/login"];
  mockPush.mockClear();
  mockReplace.mockClear();
  adapter = jest.fn(async (config) => {
    const data: Record<string, unknown> = {
      "/users/create-user": { id_usuario: 7, email: registrationForm.email },
      "/users/resend-code": { message: "Codigo enviado correctamente. Revise su bandeja de entrada." },
      "/users/verify-email": { message: "Cuenta verificada correctamente." },
      "/users/login-user": loginResponse,
      "/users/logout": { message: "Sesión cerrada correctamente." },
    };
    if (!config.url || !data[config.url]) throw new Error("Solicitud inesperada en la prueba");
    return response(config, data[config.url]);
  });
  axiosClient.defaults.adapter = adapter;
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  axiosClient.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
});

async function fillRegistration() {
  for (const [label, value] of [
    ["Nombre", registrationForm.nombre], ["Apellido paterno", registrationForm.aPaterno],
    ["Apellido materno", registrationForm.aMaterno], ["Correo electrónico", registrationForm.email],
    ["Teléfono", registrationForm.telefono], ["Contraseña", registrationForm.passw],
    ["Confirmar contraseña", registrationForm.confirmPassword],
  ]) await fireEvent.changeText(screen.getByLabelText(label), value);
}

describe("HU-01 y HU-02: conexión entre las funciones con transporte simulado", () => {
  test("recorre registro, reenvío, verificación, login y cierre sin crear sesión antes de entrar", async () => {
    const view = await render(<SessionProvider><Flow /></SessionProvider>);
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    await fillRegistration();
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    await waitFor(() => expect(screen.getByLabelText("Código de verificación")).toBeTruthy());
    expect(screen.getByLabelText("Correo electrónico").props.value).toBe(registrationForm.email);
    expect(screen.queryByText("Has iniciado sesión en Sport Center.")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Reenviar código" }));
    await waitFor(() => expect(screen.getByText(/Enviamos un código nuevo/)).toBeTruthy());
    await fireEvent.changeText(screen.getByLabelText("Código de verificación"), "654321");
    await fireEvent.press(screen.getByRole("button", { name: "Verificar cuenta" }));
    await waitFor(() => expect(screen.getByText("Cuenta verificada")).toBeTruthy());
    expect(adapter.mock.calls.map(([config]) => config.url)).toEqual([
      "/users/create-user", "/users/resend-code", "/users/verify-email",
    ]);
    expect(screen.queryByText("Has iniciado sesión en Sport Center.")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), registrationForm.email);
    await fireEvent.changeText(screen.getByLabelText("Contraseña"), registrationForm.passw);
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    await waitFor(() => expect(screen.getByText("Has iniciado sesión en Sport Center.")).toBeTruthy());
    expect(JSON.parse(adapter.mock.calls[3][0].data)).toEqual({ email: registrationForm.email, passw: registrationForm.passw });
    expect(mockHistory).toEqual(["/account"]);
    await fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(screen.getByLabelText("Contraseña")).toBeTruthy());
    expect(screen.getByLabelText("Contraseña").props.value).toBe("");
    expect(screen.getByRole("button", { name: "Abrir inicio de sesión" })).toBeTruthy();
    expect(adapter.mock.calls.map(([config]) => config.url)).toEqual([
      "/users/create-user", "/users/resend-code", "/users/verify-email", "/users/login-user", "/users/logout",
    ]);
    await view.unmount();
  });

  test("volver de registro a login descarta la contraseña sin enviar peticiones", async () => {
    const view = await render(<SessionProvider><Flow /></SessionProvider>);
    await fireEvent.press(screen.getByRole("button", { name: "Crear cuenta" }));
    await fillRegistration();
    await fireEvent.press(screen.getByRole("button", { name: "Ya tengo una cuenta" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeTruthy());
    expect(screen.getByLabelText("Contraseña").props.value).toBe("");
    expect(screen.queryByLabelText("Confirmar contraseña")).toBeNull();
    expect(adapter).not.toHaveBeenCalled();
    expect(mockHistory).toEqual(["/login"]);
    await view.unmount();
  });
});
