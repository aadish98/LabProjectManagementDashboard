import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./server";

const localStorageState = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return localStorageState.size;
  },
  clear: () => localStorageState.clear(),
  getItem: (key) => localStorageState.get(key) ?? null,
  key: (index) => Array.from(localStorageState.keys())[index] ?? null,
  removeItem: (key) => {
    localStorageState.delete(key);
  },
  setItem: (key, value) => {
    localStorageState.set(key, String(value));
  }
};

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageMock
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.localStorage.clear();
});
afterAll(() => server.close());
