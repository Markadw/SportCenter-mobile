// EXPO_PUBLIC_ values are public and are embedded by Expo CLI at build time.
const apiUrl = (process.env.EXPO_PUBLIC_API_URL?.trim()
  || 'https://back-sport-ghxk.onrender.com').replace(/\/+$/, '');

export default { apiUrl };
