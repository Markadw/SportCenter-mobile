import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { authorPreferences, parseAuthorPreferences, ReviewPreferenceStorageError } from "../src/features/reviews/preferences/authorPreferences";
import { bindReviewPreferenceOwner, reviewPreferenceKey, reviewPreferenceOwner } from "../src/features/reviews/preferences/localIdentity";
import { syntheticReviewSessionToken } from "./fixtures/reviewPreferences";
jest.mock("expo-secure-store", () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 4, getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
const native = new Map<string, string>();
const owner = { kind: "account", userId: 42 } as const;
beforeEach(() => {
  native.clear(); jest.replaceProperty(Platform, "OS", "ios");
  jest.mocked(SecureStore.getItemAsync).mockReset().mockImplementation(async key => native.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockReset().mockImplementation(async (key, value) => { native.set(key, value); });
});
afterEach(() => jest.restoreAllMocks());
it("persists only a bounded version and author IDs using device-only secure storage", async () => {
  expect(await authorPreferences.hide(owner, 9)).toEqual([9]);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("sport-center.review-authors.account.42", JSON.stringify({ version: 1, authors: [9] }), { keychainAccessible: 4 });
  expect(await authorPreferences.read(owner)).toEqual([9]);
  expect(Object.keys(JSON.parse(native.get(reviewPreferenceKey(owner))!))).toEqual(["version", "authors"]);
  expect(await authorPreferences.restoreAll(owner)).toEqual([]);
  expect(await authorPreferences.read(owner)).toEqual([]);
});
it("serializes concurrent hides without overwriting another author", async () => {
  await Promise.all([authorPreferences.hide(owner, 8), authorPreferences.hide(owner, 9)]);
  expect(await authorPreferences.read(owner)).toEqual([8, 9]);
});
it.each([null, [], {}, { version: 2, authors: [] }, { version: 1, authors: [0] }, { version: 1, authors: [-1] }, { version: 1, authors: ["9"] }, { version: 1, authors: [9, 9] }, { version: 1, authors: [], email: "not-allowed" }])("rejects unknown malformed preference schema %#", value => {
  expect(() => parseAuthorPreferences(value)).toThrow(ReviewPreferenceStorageError);
});
it("limits author counts and permits explicit restoration of malformed storage", async () => {
  native.set(reviewPreferenceKey(owner), JSON.stringify({ version: 1, authors: Array.from({ length: 100 }, (_, index) => index + 1) }));
  await expect(authorPreferences.hide(owner, 101)).rejects.toThrow(/100 autores/);
  native.set(reviewPreferenceKey(owner), "{broken");
  await expect(authorPreferences.read(owner)).rejects.toThrow(ReviewPreferenceStorageError);
  expect(await authorPreferences.restoreAll(owner)).toEqual([]);
  expect(await authorPreferences.read(owner)).toEqual([]);
});
it("keeps account, other account and guest preference keys isolated", async () => {
  await authorPreferences.hide(owner, 9);
  expect(await authorPreferences.read({ kind: "account", userId: 43 })).toEqual([]);
  expect(await authorPreferences.read({ kind: "guest" })).toEqual([]);
});
it("web keeps preferences in module memory and does not access persistent browser/native stores", async () => {
  jest.replaceProperty(Platform, "OS", "web");
  const webOwner = { kind: "account", userId: 70001 } as const;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage"), get = jest.fn(), set = jest.fn();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: get, setItem: set } });
  try {
    await authorPreferences.hide(webOwner, 9);
    expect(await authorPreferences.read(webOwner)).toEqual([9]);
    expect(authorPreferences.persistent()).toBe(false);
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled(); expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
  } finally { if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor); else Reflect.deleteProperty(globalThis, "localStorage"); }
});
it("extracts only a matching positive user ID for local namespacing, without authenticating the token", () => {
  const token = syntheticReviewSessionToken(42, "identity-one");
  expect(reviewPreferenceOwner(token, "identity-one")).toEqual(owner);
  expect(reviewPreferenceOwner()).toEqual({ kind: "guest" });
  expect(() => reviewPreferenceOwner(token, "another-session")).toThrow();
  expect(() => reviewPreferenceOwner("malformed", "identity-one")).toThrow();
  expect(() => reviewPreferenceOwner("." + token.split(".")[1] + ".", "identity-one")).toThrow();
  expect(() => reviewPreferenceOwner(syntheticReviewSessionToken(0, "zero-user"), "zero-user")).toThrow();
});
it("refuses a refreshed claim that tries to change user ID within the same session", () => {
  const first = reviewPreferenceOwner(syntheticReviewSessionToken(42, "pinned-identity"), "pinned-identity");
  bindReviewPreferenceOwner("pinned-identity", first);
  expect(reviewPreferenceOwner(syntheticReviewSessionToken(42, "pinned-identity", 2), "pinned-identity")).toEqual(owner);
  expect(() => reviewPreferenceOwner(syntheticReviewSessionToken(43, "pinned-identity", 3), "pinned-identity")).toThrow();
});
