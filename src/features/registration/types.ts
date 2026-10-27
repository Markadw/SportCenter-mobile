export interface RegistrationForm {
  nombre: string;
  aPaterno: string;
  aMaterno: string;
  email: string;
  telefono: string;
  passw: string;
  confirmPassword: string;
}

export type RegistrationPayload = Omit<RegistrationForm, "confirmPassword">;
export type FieldErrors<T> = Partial<Record<keyof T, string>>;
export type RegistrationOperation = "register" | "verify" | "resend";

export interface RegistrationReceipt {
  email: string;
}
