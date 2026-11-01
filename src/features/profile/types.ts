export interface Profile { nombre: string; aPaterno: string; aMaterno: string; email: string; telefono: string }
export type ProfileErrors = Partial<Record<keyof Profile, string>>;
