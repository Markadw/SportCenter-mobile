import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { authorPreferences } from "../src/features/reviews/preferences/authorPreferences";
import { bindReviewPreferenceOwner, forgetReviewPreferenceOwner, reviewPreferenceKey, reviewPreferenceOwner } from "../src/features/reviews/preferences/localIdentity";
import { clearCheckoutDraft, getCheckoutDraft, readCheckoutDraft, saveCheckoutDraft } from "../src/features/checkout/draft";
import { syntheticReviewSessionToken } from "./fixtures/reviewPreferences";
import { deferred } from "./fixtures/auth";

jest.mock("expo-secure-store", () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 4, getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const native = new Map<string, string>();
beforeEach(() => {
  native.clear(); jest.replaceProperty(Platform, "OS", "ios");
  jest.mocked(SecureStore.getItemAsync).mockReset().mockImplementation(async key => native.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockReset().mockImplementation(async (key, value) => { native.set(key, value); });
  jest.mocked(SecureStore.deleteItemAsync).mockReset().mockImplementation(async key => { native.delete(key); });
});
afterEach(() => jest.restoreAllMocks());

test("purga solamente las preferencias de la cuenta capturada y permite datos nuevos tras otro acceso", async () => {
  const owner = { kind: "account", userId: 6201 } as const;
  const other = { kind: "account", userId: 6202 } as const;
  const guest = { kind: "guest" } as const;
  await authorPreferences.hide(owner, 31);
  await authorPreferences.hide(other, 32);
  await authorPreferences.hide(guest, 33);
  await authorPreferences.purgeAccount(owner.userId);
  expect(native.has(reviewPreferenceKey(owner))).toBe(false);
  expect(await authorPreferences.read(owner)).toEqual([]);
  expect(await authorPreferences.read(other)).toEqual([32]);
  expect(await authorPreferences.read(guest)).toEqual([33]);
  await expect(authorPreferences.hide(owner, 34)).resolves.toEqual([34]);
  await expect(authorPreferences.restoreAll(owner)).resolves.toEqual([]);
});

test("una escritura en curso termina antes de la purga sin volver a crear preferencias", async () => {
  const owner = { kind: "account", userId: 6203 } as const;
  const writing = deferred<void>();
  const started = deferred<void>();
  jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(async (key, value) => {
    started.resolve(); await writing.promise; native.set(key, value);
  });
  const hiding = authorPreferences.hide(owner, 40).catch(error => error);
  await started.promise;
  const queued = authorPreferences.hide(owner, 41).catch(error => error);
  const purging = authorPreferences.purgeAccount(owner.userId);
  writing.resolve();
  expect(await hiding).toBeInstanceOf(Error);
  expect(await queued).toBeInstanceOf(Error);
  await purging;
  expect(native.has(reviewPreferenceKey(owner))).toBe(false);
  await expect(authorPreferences.hide(owner, 42)).resolves.toEqual([42]);
});

test("si no puede borrar sobrescribe con datos vacíos y avisa si ambas operaciones fallan", async () => {
  const owner = { kind: "account", userId: 6204 } as const;
  await authorPreferences.hide(owner, 41);
  jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error("cannot delete"));
  await authorPreferences.purgeAccount(owner.userId);
  expect(JSON.parse(native.get(reviewPreferenceKey(owner))!)).toEqual({ version: 1, authors: [] });
  jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error("cannot delete"));
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("cannot write"));
  await expect(authorPreferences.purgeAccount(6205)).rejects.toThrow(/No pudimos borrar/);
});

test("la purga web usa memoria y no toca almacenamiento nativo", async () => {
  jest.replaceProperty(Platform, "OS", "web");
  const owner = { kind: "account", userId: 6206 } as const;
  await authorPreferences.hide(owner, 42);
  await authorPreferences.purgeAccount(owner.userId);
  expect(await authorPreferences.read(owner)).toEqual([]);
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});

test("retira vínculos sólo de la cuenta eliminada", () => {
  bindReviewPreferenceOwner("removed-binding", { kind: "account", userId: 6207 });
  bindReviewPreferenceOwner("other-binding", { kind: "account", userId: 6208 });
  forgetReviewPreferenceOwner(6207);
  expect(reviewPreferenceOwner(syntheticReviewSessionToken(6209, "removed-binding"), "removed-binding")).toEqual({ kind: "account", userId: 6209 });
  expect(() => reviewPreferenceOwner(syntheticReviewSessionToken(6209, "other-binding"), "other-binding")).toThrow();
});

test("borra el borrador de la sesión eliminada y preserva el de otra sesión", () => {
  const draft = getCheckoutDraft("delete-draft");
  saveCheckoutDraft("delete-draft", { ...draft, promo: "private", address: { ...draft.address, calle: "old address" } });
  clearCheckoutDraft("delete-draft");
  expect(readCheckoutDraft("delete-draft").address.calle).toBe("");
  const other = getCheckoutDraft("other-draft");
  saveCheckoutDraft("other-draft", { ...other, promo: "keep" });
  clearCheckoutDraft("delete-draft");
  expect(readCheckoutDraft("other-draft").promo).toBe("keep");
});
