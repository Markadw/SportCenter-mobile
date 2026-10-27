import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { AxiosError, AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { AppState, Text, type AppStateStatus } from "react-native";
import axiosClient from "../../src/api/axios";
import { AppHeader } from "../../src/components/AppHeader";
import { SessionProvider, useSession } from "../../src/features/auth/context/SessionContext";
import { AccountScreen } from "../../src/features/auth/screens/AccountScreen";
import { LoginScreen } from "../../src/features/auth/screens/LoginScreen";
import { deferred, loginCredentials, loginResponse } from "../../__tests__/fixtures/auth";

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockBlur: (() => void) | undefined;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  Redirect: ({ href }: { href: string }) => {
    const { Text: NativeText } = jest.requireActual("react-native");
    return <NativeText>{`Destino: ${href}`}</NativeText>;
  },
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      mockBlur = effect();
      return () => mockBlur?.();
    }, [effect]);
  },
}));
jest.mock("lucide-react-native", () => ({ Search: () => null, ShoppingBag: () => null, User: () => null }));

let adapter: jest.MockedFunction<AxiosAdapter>;
const originalAdapter = axiosClient.defaults.adapter;
function response(config: InternalAxiosRequestConfig, data: unknown = loginResponse): AxiosResponse {
  return { config, data, status: 200, statusText: "OK", headers: new AxiosHeaders() };
}
function failure(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  return new AxiosError("detalle interno no mostrable", "ERR_BAD_REQUEST", config, undefined,
    { ...response(config, data), status, statusText: "Error" });
}

function Flow() {
  const { session, notice } = useSession();
  return <><AppHeader />{session ? <AccountScreen /> : <LoginScreen />}
    {notice && <Text testID="session-notice">{notice}</Text>}</>;
}
async function openLogin() {
  return render(<SessionProvider><Flow /></SessionProvider>);
}
async function fill(email = loginCredentials.email, password = loginCredentials.passw) {
  await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), email);
  await fireEvent.changeText(screen.getByLabelText("Contraseña"), password);
}
async function enter() {
  await fill();
  await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
  await waitFor(() => expect(screen.getByText("Has iniciado sesión en Sport Center.")).toBeTruthy());
}

beforeEach(() => {
  adapter = jest.fn(async (config) => response(config));
  axiosClient.defaults.adapter = adapter;
  mockBlur = undefined;
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  axiosClient.defaults.adapter = originalAdapter;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("CP-02 / HU-02: formulario, API y sesión en memoria", () => {
  test("campos vacíos, correo inválido y contraseña corta no llegan al backend", async () => {
    await openLogin();
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(screen.getByText("Escribe tu correo.")).toBeTruthy();
    expect(screen.getByText("Escribe tu contraseña.")).toBeTruthy();
    await fill("correo-invalido", "1234567");
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(screen.getByText("Escribe un correo válido.")).toBeTruthy();
    expect(screen.getByText("La contraseña debe tener al menos 8 caracteres.")).toBeTruthy();
    expect(adapter).not.toHaveBeenCalled();
  });

  test("admite la contraseña existente de ocho caracteres y abre la cuenta con la sesión real del cliente", async () => {
    await openLogin();
    await fill(" CLIENTE@EXAMPLE.TEST ");
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    await waitFor(() => expect(screen.getByText("Has iniciado sesión en Sport Center.")).toBeTruthy());
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0][0].url).toBe("/users/login-user");
    expect(JSON.parse(adapter.mock.calls[0][0].data)).toEqual(loginCredentials);
    expect(screen.queryByLabelText("Contraseña")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Abrir mi cuenta" }));
    expect(mockPush).toHaveBeenCalledWith("/account");
  });

  test("mostrar y ocultar conserva el valor y no envía solicitudes", async () => {
    await openLogin();
    await fill();
    expect(screen.getByLabelText("Contraseña").props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(screen.getByLabelText("Contraseña").props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(screen.getByLabelText("Contraseña").props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText("Contraseña").props.value).toBe(loginCredentials.passw);
    expect(adapter).not.toHaveBeenCalled();
  });

  test.each([
    [400, { code: 1, message: "no mostrar credenciales de la petición" }, "El correo o la contraseña no son correctos. Revisa tus datos."],
    [400, { code: 2 }, "Tu cuenta todavía no está verificada. Revisa el correo que recibiste para activarla."],
    [401, {}, "El correo o la contraseña no son correctos. Revisa tus datos."],
    [429, {}, "Has realizado demasiados intentos. Espera un minuto antes de volver a intentarlo."],
    [503, { message: "SQL dato-interno" }, "El servidor no está disponible. Inténtalo más tarde."],
    [403, { message: "dato-interno" }, "No se pudo iniciar sesión. Inténtalo de nuevo más tarde."],
  ])("controla HTTP %s, conserva la pantalla pública y no muestra datos internos", async (status, data, message) => {
    adapter.mockImplementationOnce(async (config) => { throw failure(config, status, data); });
    await openLogin();
    await fill();
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("Has iniciado sesión en Sport Center.")).toBeNull();
    expect(screen.queryByText(/dato-interno|SQL|no mostrar credenciales/)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Contraseña"), "corregida123");
    expect(screen.queryByText(message)).toBeNull();
  });

  test("un timeout no reintenta solo ni crea sesión y permite un reintento manual", async () => {
    adapter.mockRejectedValueOnce(new AxiosError("timeout", "ECONNABORTED"));
    await openLogin();
    await fill();
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByText("No pudimos conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.")).toBeTruthy();
    expect(adapter).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByText("Has iniciado sesión en Sport Center.")).toBeTruthy();
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  test("rechaza HTTP 200 sin tokens antes de permitir el acceso privado", async () => {
    adapter.mockImplementationOnce(async (config) => response(config, {}));
    await openLogin();
    await fill();
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByText("No pudimos confirmar una sesión válida. Vuelve a intentarlo.")).toBeTruthy();
    expect(screen.queryByText("Has iniciado sesión en Sport Center.")).toBeNull();
  });

  test("botón y teclado comparten bloqueo mientras se espera al servidor", async () => {
    const pending = deferred<AxiosResponse>();
    adapter.mockImplementationOnce(() => pending.promise);
    await openLogin();
    await fill();
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeDisabled();
    expect(screen.getByLabelText("Correo electrónico").props.editable).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    await fireEvent(screen.getByLabelText("Contraseña"), "submitEditing");
    expect(adapter).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(response(adapter.mock.calls[0][0])));
    expect(screen.getByText("Has iniciado sesión en Sport Center.")).toBeTruthy();
  });

  test("salir de login cancela la petición, borra los campos y descarta su respuesta tardía", async () => {
    const pending = deferred<AxiosResponse>();
    adapter.mockImplementationOnce(() => pending.promise);
    await openLogin();
    await fill();
    await fireEvent.press(screen.getByRole("button", { name: "Mostrar contraseña" }));
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    const config = adapter.mock.calls[0][0];
    await act(async () => mockBlur?.());
    expect(config.signal?.aborted).toBe(true);
    expect(screen.getByLabelText("Contraseña").props.value).toBe("");
    expect(screen.getByLabelText("Contraseña").props.secureTextEntry).toBe(true);
    await act(async () => pending.resolve(response(config)));
    expect(screen.queryByText("Has iniciado sesión en Sport Center.")).toBeNull();
  });

  test("una entrada privada sin sesión redirige a login y el icono de usuario también", async () => {
    await render(<SessionProvider><AppHeader /><AccountScreen /></SessionProvider>);
    expect(screen.getByText("Destino: /login")).toBeTruthy();
    expect(screen.queryByText("Has iniciado sesión en Sport Center.")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Abrir inicio de sesión" }));
    expect(mockPush).toHaveBeenCalledWith("/login");
  });

  test("logout limpia la sesión, llama al backend y permite otra cuenta sin conservar la contraseña", async () => {
    await openLogin();
    await enter();
    await fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(adapter).toHaveBeenCalledTimes(2));
    const logout = adapter.mock.calls[1][0];
    expect(logout.url).toBe("/users/logout");
    expect(logout.headers.get("Authorization")).toBe(`Bearer ${loginResponse.accessToken}`);
    expect(screen.queryByText("Has iniciado sesión en Sport Center.")).toBeNull();
    expect(screen.getByLabelText("Contraseña").props.value).toBe("");
    await fill("otra@example.test", "otra1234");
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    expect(await screen.findByText("Has iniciado sesión en Sport Center.")).toBeTruthy();
    expect(JSON.parse(adapter.mock.calls[2][0].data)).toEqual({ email: "otra@example.test", passw: "otra1234" });
    expect(adapter.mock.calls[2][0].headers.get("Authorization")).toBeUndefined();
  });

  test("si falla el cierre remoto, el acceso local queda retirado y se informa el límite", async () => {
    await openLogin();
    await enter();
    adapter.mockRejectedValueOnce(new AxiosError("sin red", "ERR_NETWORK"));
    await fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(screen.getByTestId("session-notice")).toHaveTextContent(/no pudimos confirmar el cierre en el servidor/));
    expect(screen.queryByText("Has iniciado sesión en Sport Center.")).toBeNull();
  });

  test("los registros HTTP no contienen contraseñas, tokens ni cuerpo de error", async () => {
    adapter.mockImplementationOnce(async (config) => { throw failure(config, 400, { code: 1, message: "SQL dato-secreto" }); });
    await openLogin();
    await fill();
    await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
    await screen.findByText("El correo o la contraseña no son correctos. Revisa tus datos.");
    await enter();
    await fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(adapter).toHaveBeenCalledTimes(3));
    const logs = JSON.stringify([jest.mocked(console.info).mock.calls, jest.mocked(console.warn).mock.calls]);
    expect(logs).not.toContain("dato-secreto");
    expect(logs).not.toContain(loginCredentials.passw);
    expect(logs).not.toContain(loginCredentials.email);
    expect(logs).not.toContain(loginResponse.accessToken);
    expect(logs).not.toContain(loginResponse.refreshToken);
  });

  test("permite continuar al catálogo público desde una entrada directa a login", async () => {
    await openLogin();
    await fireEvent.press(screen.getByRole("button", { name: "Continuar sin iniciar sesión" }));
    expect(mockReplace).toHaveBeenCalledWith("/catalog");
    expect(adapter).not.toHaveBeenCalled();
  });

  test("una nueva instancia de la aplicación inicia sin sesión persistida", async () => {
    const view = await openLogin();
    await enter();
    await view.unmount();
    await openLogin();
    expect(screen.queryByText("Has iniciado sesión en Sport Center.")).toBeNull();
    expect(screen.getByLabelText("Contraseña").props.value).toBe("");
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  test("vence según el plazo del backend y elimina el acceso privado", async () => {
    jest.useFakeTimers();
    adapter.mockImplementationOnce(async (config) => response(config, { ...loginResponse, accessTokenExpiresIn: "1s" }));
    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    await act(async () => result.current.signIn(loginCredentials, new AbortController().signal));
    expect(result.current.session).not.toBeNull();
    await act(async () => jest.advanceTimersByTime(1000));
    expect(result.current.session).toBeNull();
    expect(result.current.notice).toContain("venció");
  });

  test("al volver del fondo también comprueba la vigencia, aunque no haya corrido el temporizador", async () => {
    let onStateChange: ((state: AppStateStatus) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
      onStateChange = listener;
      return { remove };
    });
    const { result, unmount } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    await act(async () => result.current.signIn(loginCredentials, new AbortController().signal));
    const expiry = result.current.session!.expiresAt;
    jest.spyOn(Date, "now").mockReturnValue(expiry + 1);
    await act(async () => onStateChange?.("active"));
    expect(result.current.session).toBeNull();
    await unmount();
    expect(remove).toHaveBeenCalled();
  });

  test("un 401 con el token actual invalida la sesión, pero uno de una cuenta anterior no", async () => {
    const { result } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    await act(async () => result.current.signIn(loginCredentials, new AbortController().signal));
    const previous = result.current.session!.accessToken;
    adapter.mockImplementationOnce(async (config) => response(config, { ...loginResponse, accessToken: "token-segunda-cuenta" }));
    await act(async () => result.current.signIn(loginCredentials, new AbortController().signal));
    adapter.mockImplementationOnce(async (config) => { throw failure(config, 401, {}); });
    await act(async () => {
      await axiosClient.get("/users/profile", { headers: { Authorization: `Bearer ${previous}` } }).catch(() => {});
    });
    expect(result.current.session?.accessToken).toBe("token-segunda-cuenta");
    adapter.mockImplementationOnce(async (config) => { throw failure(config, 401, {}); });
    await act(async () => {
      await axiosClient.get("/users/profile", { headers: { Authorization: "Bearer token-segunda-cuenta" } }).catch(() => {});
    });
    expect(result.current.session).toBeNull();
    expect(result.current.notice).toContain("ya no está activa");
  });

  test("desmontar el proveedor mientras llega login impide recuperar una sesión antigua", async () => {
    const pending = deferred<AxiosResponse>();
    adapter.mockImplementationOnce(() => pending.promise);
    const { result, unmount } = await renderHook(() => useSession(), { wrapper: SessionProvider });
    const operation = result.current.signIn(loginCredentials, new AbortController().signal);
    await waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
    await unmount();
    await act(async () => pending.resolve(response(adapter.mock.calls[0][0])));
    await operation;
    const next = await renderHook(() => useSession(), { wrapper: SessionProvider });
    expect(next.result.current.session).toBeNull();
  });
});
