import axiosClient from "./axios";
import { createProfileRepository, type ProfileRepository } from "../features/profile/repositories/ProfileRepository";

// Punto de composición: conserva la API usada por los ViewModels con el transporte real.
export const profileApi: ProfileRepository = createProfileRepository(axiosClient);
export { parseProfile } from "../features/profile/repositories/ProfileRepository";
