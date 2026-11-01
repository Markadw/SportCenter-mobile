import { act, renderHook } from "@testing-library/react-native";
import { registrationApi } from "../src/api/registrationApi";
import { consentReceiptStorage } from "../src/features/privacy/consentReceiptStorage";
import { useRegisterViewModel } from "../src/features/registration/hooks/useRegisterViewModel";
import { registrationForm } from "./fixtures/registration";
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock("../src/api/registrationApi", () => ({ registrationApi: { register: jest.fn() } }));
jest.mock("../src/features/privacy/consentReceiptStorage", () => ({
  ...jest.requireActual("../src/features/privacy/consentReceiptStorage"),
  consentReceiptStorage: { save: jest.fn().mockResolvedValue(undefined) },
}));

test("el ViewModel exige aceptación independiente de los campos, nunca la restaura ni la envía al backend", async () => {
  const { result } = await renderHook(useRegisterViewModel);
  expect(result.current.necessaryProcessingAccepted).toBe(false);
  await act(async () => result.current.submit());
  expect(result.current.errors.nombre).toBeTruthy();
  expect(result.current.consentError).toBeNull();
  await act(() => {
    for (const [field, value] of Object.entries(registrationForm)) result.current.setField(field as keyof typeof registrationForm, value);
  });
  await act(async () => result.current.submit());
  expect(result.current.consentError).toBeTruthy();
  expect(registrationApi.register).not.toHaveBeenCalled();
  expect(consentReceiptStorage.save).not.toHaveBeenCalled();
  jest.mocked(registrationApi.register).mockResolvedValueOnce({ email: registrationForm.email });
  await act(() => result.current.setNecessaryProcessingAccepted(true));
  await act(async () => result.current.submit());
  expect(registrationApi.register).toHaveBeenCalledTimes(1);
  expect(consentReceiptStorage.save).toHaveBeenCalledTimes(1);
  expect(result.current.necessaryProcessingAccepted).toBe(false);
  expect(result.current.form.passw).toBe("");
  expect(mockReplace).toHaveBeenCalledWith({ pathname: "/verify-email", params: { email: registrationForm.email } });
});
