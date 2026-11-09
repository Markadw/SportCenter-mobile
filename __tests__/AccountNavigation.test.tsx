import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccountScreen } from "../src/features/auth/screens/AccountScreen";
import { AccountTabScreen } from "../src/features/auth/screens/AccountTabScreen";
import { LoginScreen } from "../src/features/auth/screens/LoginScreen";
import type { Session } from "../src/features/auth/types";
const mockPush = jest.fn(), mockReplace = jest.fn();
const mockAuth = {
  session: null as Session | null, notice: null as string | null, isRestoring: false,
  signIn: jest.fn(), signOut: jest.fn().mockResolvedValue(undefined),
};
jest.mock("../src/features/auth/context/SessionContext", () => ({ useSession: () => mockAuth }));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
  Redirect: ({ href }: { href: string }) => {
    const { Text: NativeText } = jest.requireActual("react-native");
    return <NativeText>{`Destino: ${href}`}</NativeText>;
  },
}));
jest.mock("lucide-react-native", () => ({ User: () => null }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
const session: Session = { accessToken: "eyJhbGciOiJIUzI1NiJ9.eyJpZF91c3VhcmlvIjoxNywicm9sIjoxLCJzZXNzaW9uSWQiOiJzZXNpb24tcHJ1ZWJhIn0.signature", refreshToken: "refresh-prueba", sessionId: "sesion-prueba", expiresAt: Date.now() + 900_000 };
beforeEach(() => { mockAuth.session = null; mockAuth.notice = null; mockAuth.isRestoring = false; });

test("cuenta autenticada conecta perfil, pedidos, privacidad y baja y muestra avisos de almacenamiento", async () => {
  mockAuth.session = session;
  mockAuth.notice = "No pudimos guardar la sesión de forma segura.";
  await render(<AccountScreen />);
  expect(screen.getByRole("alert")).toHaveTextContent(mockAuth.notice);
  for (const label of ["Mi perfil", "Mis pedidos", "Privacidad y términos", "Eliminar cuenta"]) {
    await fireEvent.press(screen.getByRole("button", { name: label }));
  }
  expect(mockPush.mock.calls.map(([target]) => target)).toEqual([
    "/profile", "/orders", "/privacy", "/account-deletion",
  ]);
  await fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión" }));
  expect(mockAuth.signOut).toHaveBeenCalledTimes(1);
  expect(mockReplace).toHaveBeenCalledWith("/login");
});

test("un invitado puede abrir privacidad o solicitar baja sin pasar por login", async () => {
  await render(<AccountTabScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Privacidad y términos" }));
  await fireEvent.press(screen.getByRole("button", { name: "Solicitar eliminación de cuenta" }));
  expect(mockPush).toHaveBeenNthCalledWith(1, "/privacy");
  expect(mockPush).toHaveBeenNthCalledWith(2, { pathname: "/privacy", params: { section: "deletion" } });
  expect(screen.queryByRole("button", { name: "Mi perfil" })).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();
});

test("una cuenta con permisos de equipo no muestra eliminación autoservicio", async () => {
  mockAuth.session = { ...session, accessToken: "eyJhbGciOiJIUzI1NiJ9.eyJpZF91c3VhcmlvIjoxNywicm9sIjoyfQ.signature" };
  await render(<AccountScreen />);
  expect(screen.queryByRole("button", { name: "Eliminar cuenta" })).toBeNull();
  expect(screen.getByRole("button", { name: "Mi perfil" })).toBeTruthy();
});

test("restauración no expone ni redirige la cuenta antes de conocer su sesión", async () => {
  mockAuth.isRestoring = true;
  const view = await render(<AccountScreen />);
  expect(screen.getByText("Restaurando sesión")).toBeTruthy();
  expect(screen.queryByText("Destino: /login")).toBeNull();
  expect(screen.queryByText("Has iniciado sesión en Sport Center.")).toBeNull();
  await view.rerender(<AccountTabScreen />);
  expect(screen.getByText("Restaurando sesión")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Iniciar sesión" })).toBeNull();
});

test("login abre recuperación sin enviar credenciales", async () => {
  await render(<LoginScreen />);
  await fireEvent.press(screen.getByRole("link", { name: "Olvidé mi contraseña" }));
  expect(mockPush).toHaveBeenCalledWith("/forgot-password");
  expect(mockAuth.signIn).not.toHaveBeenCalled();
});
