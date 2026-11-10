import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import { PRIVACY, TERMS } from "../src/features/legal/documents";
import { LegalDocumentScreen } from "../src/features/legal/LegalDocumentScreen";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ Stack: { Screen: () => null }, useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true, replace: jest.fn() }) }));
jest.mock("lucide-react-native", () => ({ ChevronLeft: () => null }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

test("términos muestra sus 9 apartados con los datos institucionales resueltos", async () => {
  await render(<LegalDocumentScreen heading="Términos y condiciones" document={TERMS} />);
  expect(screen.getByText("Términos y condiciones de Sport Center")).toBeTruthy();
  expect(screen.getByText("Versión del documento: 8 de noviembre de 2026")).toBeTruthy();
  for (const title of TERMS.sections.map(s => s.title)) expect(screen.getByText(title)).toBeTruthy();
  expect(TERMS.sections).toHaveLength(9);
  expect(screen.getByText(/Carlos Reyes Mendoza/)).toBeTruthy();
});

test("los enlaces internos navegan y los externos abren el sistema", async () => {
  const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  await render(<LegalDocumentScreen heading="Términos y condiciones" document={TERMS} />);
  await fireEvent.press(screen.getAllByText("Aviso de Privacidad")[0]);
  expect(mockPush).toHaveBeenCalledWith("/legal/privacy");
  await fireEvent.press(screen.getByText("PROFECO"));
  expect(open).toHaveBeenCalledWith("https://www.gob.mx/profeco");
  open.mockRestore();
});

test("aviso de privacidad muestra sus 8 apartados y enlaza la eliminación de cuenta de la app", async () => {
  await render(<LegalDocumentScreen heading="Política de privacidad" document={PRIVACY} />);
  expect(PRIVACY.sections).toHaveLength(8);
  for (const title of PRIVACY.sections.map(s => s.title)) expect(screen.getByText(title)).toBeTruthy();
  await fireEvent.press(screen.getByText("Eliminar mi cuenta"));
  expect(mockPush).toHaveBeenCalledWith("/account-deletion");
});
