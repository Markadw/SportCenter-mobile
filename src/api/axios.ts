// src/api/axiosClient.ts
import axios from "axios";
import env from "../config/env";

const axiosClient = axios.create({
  baseURL: env.apiUrl,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// 🔎 LOG de peticiones salientes
axiosClient.interceptors.request.use((config) => {
  if (__DEV__) {
    console.log("➡️ REQUEST:", config.method?.toUpperCase(), `${config.baseURL}${config.url}`);
    if (config.params) console.log("   params:", config.params);
    if (config.data) console.log("   body:", config.data);
  }
  return config;
});

// ✅ LOG de respuestas exitosas
axiosClient.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      console.log(
        "✅ RESPONSE:",
        response.status,
        response.config.url,
        "→",
        JSON.stringify(response.data).slice(0, 500) // recorta si es muy grande
      );
    }
    return response;
  },
  // ❌ LOG de errores detallado
  (error) => {
    if (__DEV__) {
      console.log("❌ API Error");
      console.log("   message:", error.message);
      console.log("   code:", error.code);
      console.log("   url:", error.config?.baseURL + error.config?.url);
      console.log("   method:", error.config?.method);
      if (error.response) {
        console.log("   status:", error.response.status);
        console.log("   data:", error.response.data);
      } else if (error.request) {
        console.log("   ⚠️ No hubo respuesta. request enviado pero sin reply.");
        console.log("   Posibles causas: backend apagado, IP incorrecta, firewall, CORS.");
        console.log("   URL intentada:", error.config?.baseURL + error.config?.url);
      }
    }
    return Promise.reject(error);
  }
);

export default axiosClient;