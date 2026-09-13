import axios from "axios";
import type { ApiResponse, Document, User } from "../types";

const rawBase = import.meta.env.VITE_API_URL || "";
const apiBase =
  (import.meta.env.PROD || import.meta.env.MODE === "production") && rawBase.includes("localhost")
    ? ""
    : rawBase;

export const api = axios.create({
  baseURL: `${apiBase}/api`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("pharmabrain_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    api.post<ApiResponse<{ token: string; user: User }>>("/auth/register", data),

  login: (data: { email: string; password: string }) =>
    api.post<ApiResponse<{ token: string; user: User }>>("/auth/login", data),

  me: () => api.get<ApiResponse<User>>("/auth/me"),
};

export const documentApi = {
  list: () => api.get<ApiResponse<Document[]>>("/documents"),

  get: (id: string) => api.get<ApiResponse<Document>>(`/documents/${id}`),

  upload: (body: FormData) => api.post<ApiResponse<Document>>("/documents/upload", body),

  analyse: (id: number) => api.post(`/documents/${id}/analyse`),

  remove: (id: number) => api.delete(`/documents/${id}`),
};

