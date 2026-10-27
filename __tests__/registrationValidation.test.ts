import { httpError, registrationForm } from "./fixtures/registration";
import { registrationErrorMessage, UnconfirmedResponseError } from "../src/features/registration/errors";
import { registrationPayload, validateRegistration } from "../src/features/registration/validation";
import type { RegistrationForm } from "../src/features/registration/types";

describe("HU-01: validación previa al registro", () => {
  test("acepta los datos del contrato y normaliza correo y nombres sin cambiar la contraseña", () => {
    const form = { ...registrationForm, nombre: " María ", email: " CLIENTE@EXAMPLE.TEST " };
    expect(validateRegistration(form)).toEqual({});
    const payload = registrationPayload(form);
    expect(payload).toEqual({ nombre: "María", aPaterno: "López", aMaterno: "Pérez",
      email: "cliente@example.test", telefono: "7711234567", passw: registrationForm.passw });
    expect(payload).not.toHaveProperty("confirmPassword");
  });

  test.each(Object.keys(registrationForm) as (keyof RegistrationForm)[])("exige el campo %s", (field) => {
    expect(validateRegistration({ ...registrationForm, [field]: "" })[field]).toBeTruthy();
  });

  test.each(["123456789", "+527711234567", "771 1234567", "77112345678", "abcdefghij"])("rechaza teléfono %s sin truncarlo", (telefono) => {
    expect(validateRegistration({ ...registrationForm, telefono }).telefono).toBeTruthy();
  });

  test.each(["cliente", "a@b", "a@b.c", "a b@example.test", "a@b.123"])("rechaza correo %s", (email) => {
    expect(validateRegistration({ ...registrationForm, email }).email).toBeTruthy();
  });

  test.each(["Corta1!", "deportes2026!", "DEPORTES2026!", "DeportesLargos!", "Deportes2026A", "Deporte2026! ", "Deporte2026!+"])(
    "rechaza contraseña fuera del contrato: %s", (passw) => {
      expect(validateRegistration({ ...registrationForm, passw, confirmPassword: passw }).passw).toBeTruthy();
    });

  test("acepta exactamente 12 caracteres y no agrega una regla de secuencias inexistente", () => {
    expect(validateRegistration({ ...registrationForm, passw: "Deporte123!Ab", confirmPassword: "Deporte123!Ab" })).toEqual({});
  });

  test("rechaza una confirmación diferente", () => {
    expect(validateRegistration({ ...registrationForm, confirmPassword: "OtraClave2026!" }).confirmPassword).toBeTruthy();
  });

  test.each([["nombre", 31], ["aPaterno", 41], ["aMaterno", 41], ["email", 101]] as const)(
    "respeta el tamaño declarado de %s", (field, length) => {
      const value = field === "email" ? "a".repeat(length - 13) + "@example.test" : "a".repeat(length);
      expect(validateRegistration({ ...registrationForm, [field]: value })[field]).toBeTruthy();
    });
});

describe("HU-01: mensajes seguros del contrato", () => {
  test("explica que el conflicto puede ser de correo o teléfono sin atribuirlo a un campo", () => {
    expect(registrationErrorMessage(httpError("Revisa que tu información sea correcta. Intenta de nuevo"), "register"))
      .toBe("Ya existe una cuenta con ese correo o teléfono. Si aún no verificaste tu cuenta, usa «Ya tengo un código».");
  });
  test("no interpreta como duplicado la cuenta desconocida durante verificación", () => {
    expect(registrationErrorMessage(httpError("Revisa que tu información sea correcta. Intenta de nuevo"), "verify"))
      .toBe("Revisa que tu información sea correcta. Intenta de nuevo.");
  });
  test("reconoce el fallo de correo y descarta el detalle del proveedor", () => {
    const result = registrationErrorMessage(httpError("Revisa que tu información sea correcta. Intenta de nuevo 1.Error SMTP: secreto-interno"), "register");
    expect(result).toBe("El servidor no pudo enviar el correo de verificación. Inténtalo más tarde.");
    expect(result).not.toMatch(/SMTP|secreto-interno/);
  });
  test("deduplica mensajes de validación", () => {
    expect(registrationErrorMessage(httpError(["Todos los campos son obligatorios", "Todos los campos son obligatorios"]), "register"))
      .toBe("Completa todos los campos obligatorios.");
  });
  test.each(["El token ha expirado, solicita uno nuevo.", "Se han agotado los intentos. Solicita un nuevo token.",
    "Has agotado los intentos. Solicita un nuevo token.", "El token es incorrecto. Te quedan 1 intentos."])(
    "presenta el fallo de verificación sin ocultarlo: %s", (message) => {
      expect(registrationErrorMessage(httpError(message), "verify")).toMatch(/código|Código/);
    });
  test("oculta detalles del proveedor de correo y HTML de errores", () => {
    expect(registrationErrorMessage(httpError("Error SMTP: clave-interna <html>"), "register")).not.toMatch(/SMTP|clave-interna|html/);
  });
  test("un timeout o respuesta inesperada no afirma que el registro falló ni lo reenvía", () => {
    expect(registrationErrorMessage({ isAxiosError: true, code: "ECONNABORTED" }, "register")).toContain("Revisa tu correo");
    expect(registrationErrorMessage(new UnconfirmedResponseError(), "register")).toContain("Ya tengo un código");
    expect(registrationErrorMessage(httpError("error", 503), "resend")).toContain("Revisa tu correo");
  });
  test("explica el límite de intentos", () => {
    expect(registrationErrorMessage(httpError("ThrottlerException", 429), "verify")).toContain("Espera un minuto");
  });
});
