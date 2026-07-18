/* Configuração do painel. Env var vence; fallback prod = Render, dev = localhost. */
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

const API_DEFAULT = env.PROD
  ? 'https://summerdrinks-atendimento.onrender.com'
  : 'http://localhost:3000';

export const API_URL =
  env.VITE_API_URL ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('sdp_api_url')) ||
  API_DEFAULT;

export const TENANT =
  env.VITE_TENANT ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('sdp_tenant')) ||
  'summer';
