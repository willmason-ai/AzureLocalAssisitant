import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000, // 30s default timeout — don't let requests hang forever
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses by clearing token and letting React handle the redirect.
// Avoid hard window.location redirect which can blank the screen during render.
let isRedirecting = false;
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isRedirecting) {
      // Only redirect once, not for every parallel request that gets 401
      isRedirecting = true;
      localStorage.removeItem('auth_token');
      // Use a small delay to let any in-flight renders complete before redirecting
      setTimeout(() => {
        isRedirecting = false;
        window.location.href = '/login';
      }, 100);
    }
    return Promise.reject(error);
  }
);

export default api;
