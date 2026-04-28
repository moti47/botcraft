import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = err?.response?.data?.detail || err?.message || 'Unknown error'
    err.userMessage = typeof msg === 'string' ? msg : JSON.stringify(msg)
    return Promise.reject(err)
  },
)

export const endpoints = {
  health: () => api.get('/health'),
  colabHealth: () => api.get('/colab/health'),
  llmUsage: () => api.get('/llm/usage'),

  avatarsList: () => api.get('/avatars'),
  avatarGet: (id) => api.get(`/avatars/${id}`),
  avatarCreate: (data) => api.post('/avatars/create', data),
  avatarUpdate: (id, data) => api.patch(`/avatars/${id}`, data),
  avatarDelete: (id) => api.delete(`/avatars/${id}`),
  avatarRegenerateImage: (id, data = {}) => api.post(`/avatars/${id}/regenerate-image`, data),
  platformConnect: (id, data) => api.post(`/avatars/${id}/platforms/connect`, data),
  platformDisconnect: (id, platform) => api.delete(`/avatars/${id}/platforms/${platform}`),
  platformsList: (id) => api.get(`/avatars/${id}/platforms`),

  // Commands
  commandsList: (id) => api.get(`/avatars/${id}/commands`),
  commandCreate: (id, data) => api.post(`/avatars/${id}/commands`, data),
  commandUpdate: (id, cmdId, data) => api.patch(`/avatars/${id}/commands/${cmdId}`, data),
  commandDelete: (id, cmdId) => api.delete(`/avatars/${id}/commands/${cmdId}`),

  // Files
  filesList: (id) => api.get(`/avatars/${id}/files`),
  fileUpload: (id, formData) => api.post(`/avatars/${id}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 600_000,
  }),
  fileUpdate: (id, fileId, data) => api.patch(`/avatars/${id}/files/${fileId}`, data),
  fileDelete: (id, fileId) => api.delete(`/avatars/${id}/files/${fileId}`),

  // Scheduler
  schedulerStatus: () => api.get('/scheduler/status'),

  // Diagnostics
  diagnostics: () => api.get('/admin/diagnostics'),
  colabUrlsGet: () => api.get('/admin/colab-urls'),
  colabUrlsSet: (data) => api.post('/admin/colab-urls', data),

  videosList: (params) => api.get('/videos', { params }),
  videosRecent: () => api.get('/videos/recent'),
  videoProduce: (data) => api.post('/videos/produce', data),
  videoGet: (id) => api.get(`/videos/${id}`),
  videoDelete: (id) => api.delete(`/videos/${id}`),
  videoRetry: (id) => api.post(`/videos/${id}/retry`),

  postPublish: (data) => api.post('/posts/publish', data),

  trends: () => api.get('/trends'),

  analyticsSummary: (days = 7) => api.get('/analytics/summary', { params: { days } }),

  configGet: () => api.get('/admin/config'),
  configUpdate: (data) => api.post('/admin/config', data),

  pauseAll: () => api.post('/admin/pause-all'),
  clearQueue: () => api.post('/admin/clear-queue'),
  exportData: () => api.get('/admin/export', { responseType: 'blob' }),

  // Notifications (in-app + SSE + push)
  notificationsList: (params) => api.get('/notifications', { params }),
  notificationsUnreadCount: () => api.get('/notifications/unread-count'),
  notificationMarkRead: (id) => api.post(`/notifications/${id}/read`),
  notificationMarkAllRead: () => api.post('/notifications/read-all'),
  notificationDelete: (id) => api.delete(`/notifications/${id}`),
  notificationsPushSubscribe: (data) => api.post('/notifications/push/subscribe', data),
  notificationsPushUnsubscribe: (data) => api.post('/notifications/push/unsubscribe', data),

  // Ideas
  ideasList: (avatarId) => api.get(`/avatars/${avatarId}/ideas`),
  ideaCreate: (avatarId, data) => api.post(`/avatars/${avatarId}/ideas`, data),
  ideaDelete: (avatarId, ideaId) => api.delete(`/avatars/${avatarId}/ideas/${ideaId}`),
  ideaMarkUsed: (avatarId, ideaId) => api.post(`/avatars/${avatarId}/ideas/${ideaId}/use`),

  // Duplicate
  avatarDuplicate: (id, data) => api.post(`/avatars/${id}/duplicate`, data),

  // Chat agent
  chatSend: (message) => api.post('/chat', { message }),
  chatHistory: (limit = 30) => api.get('/chat/history', { params: { limit } }),

  // Insights
  insightsGet: (avatarId) => api.get(`/avatars/${avatarId}/insights`),
  insightsRefresh: (avatarId) => api.post(`/avatars/${avatarId}/insights/refresh`),

  // Persona variants (A/B testing)
  variantsList: (avatarId) => api.get(`/avatars/${avatarId}/variants`),
  variantCreate: (avatarId, data) => api.post(`/avatars/${avatarId}/variants`, data),
  variantPromote: (avatarId, variantId) => api.post(`/avatars/${avatarId}/variants/${variantId}/promote`),
  variantDelete: (avatarId, variantId) => api.delete(`/avatars/${avatarId}/variants/${variantId}`),

  // Cross-avatar idea share
  ideaShareTo: (srcId, ideaId, dstId) => api.post(`/avatars/${srcId}/ideas/${ideaId}/share-to/${dstId}`),
}
