// src/config/env.ts
const ENV = {
  dev: {
    apiUrl: "https://back-sport-ghxk.onrender.com", // ← pon TU IP local
  },
  prod: {
    apiUrl: "https://back-sport-ghxk.onrender.com",
  },
};

export default __DEV__ ? ENV.dev : ENV.prod;