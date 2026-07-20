const BASE_URL = '/api';

function getToken() {
  return uni.getStorageSync('token') || '';
}

export function request({ url, method = 'GET', data, timeout = 45000 }) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE_URL + url,
      method,
      data,
      timeout,
      header: {
        'Content-Type': 'application/json',
        Authorization: getToken() ? `Bearer ${getToken()}` : ''
      },
      success: (res) => {
        if (res.statusCode === 401) {
          uni.removeStorageSync('token');
          uni.navigateTo({ url: '/pages/login/login' });
          reject(new Error('请先登录'));
          return;
        }
        if (res.statusCode === 429 || res.data?.code === 429) {
          reject(new Error(res.data?.message || '请求过于频繁，请稍后再试'));
          return;
        }
        if (res.statusCode === 403 || res.data?.code === 403 || res.data?.needVip) {
          const err = new Error(res.data?.message || '请先开通会员');
          err.needVip = true;
          reject(err);
          return;
        }
        if (res.data?.code === 200) {
          resolve(res.data.data);
        } else {
          reject(new Error(res.data?.message || '请求失败'));
        }
      },
      fail: (err) => {
        const msg = String(err?.errMsg || err?.message || '');
        if (/timeout|超时/i.test(msg)) {
          reject(new Error('请求超时，请稍后重试'));
          return;
        }
        reject(err instanceof Error ? err : new Error(msg || '网络异常'));
      }
    });
  });
}

export function uploadProductPhoto(filePath, slot) {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: BASE_URL + '/uploads/product',
      filePath,
      name: 'file',
      formData: { slot },
      header: {
        Authorization: getToken() ? `Bearer ${getToken()}` : ''
      },
      success: (res) => {
        if (res.statusCode === 401) {
          uni.removeStorageSync('token');
          uni.navigateTo({ url: '/pages/login/login' });
          reject(new Error('请先登录'));
          return;
        }
        let body;
        try {
          body = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        } catch {
          reject(new Error('上传响应解析失败'));
          return;
        }
        if (res.statusCode === 403 || body?.code === 403 || body?.needVip) {
          const err = new Error(body?.message || '请先开通会员');
          err.needVip = true;
          reject(err);
          return;
        }
        if (body?.code === 200) {
          resolve(body.data);
        } else {
          reject(new Error(body?.message || '上传失败'));
        }
      },
      fail: (err) => reject(err)
    });
  });
}

export const api = {
  login: (phone, password, opts = {}) =>
    request({
      url: '/auth/login',
      method: 'POST',
      data: {
        phone,
        password,
        acceptedTerms: opts.acceptedTerms !== false
      }
    }),
  register: (phone, password, inviteCode, opts = {}) =>
    request({
      url: '/auth/register',
      method: 'POST',
      data: {
        phone,
        password,
        inviteCode,
        acceptedTerms: !!opts.acceptedTerms,
        ageConfirmed: !!opts.ageConfirmed
      }
    }),
  deleteAccount: (password, confirm) =>
    request({
      url: '/auth/delete-account',
      method: 'POST',
      data: { password, confirm }
    }),
  getMe: () => request({ url: '/user/me' }),
  getMemberPlans: () => request({ url: '/membership/plans' }),
  getMembershipConfig: () => request({ url: '/membership/config' }),
  getMembershipMe: () => request({ url: '/membership/me' }),
  createMemberOrder: (planId) =>
    request({ url: '/membership/order', method: 'POST', data: { planId } }),
  payMemberOrder: (orderId) =>
    request({ url: '/membership/pay', method: 'POST', data: { orderId } }),
  activateMembership: (code) =>
    request({ url: '/membership/activate', method: 'POST', data: { code } }),
  getAgentCodes: () => request({ url: '/membership/agent/codes' }),
  createAgentCodes: (data) =>
    request({ url: '/membership/agent/codes', method: 'POST', data }),
  getCategories: () => request({ url: '/templates/categories' }),
  getTemplate: (id) => request({ url: `/templates/${id}` }),
  generate: (templateId, inputs, options = {}) =>
    request({
      url: '/generate',
      method: 'POST',
      data: {
        templateId,
        inputs,
        imageCount: options.imageCount ?? 0,
        imageSize: options.imageSize ?? 'landscape',
        imageSource: options.imageSource ?? 'ai',
        productPhotos: options.productPhotos
      }
    }),
  uploadProductPhoto,
  generateImage: (data) => request({ url: '/images/generate', method: 'POST', data }),
  getRecords: () => request({ url: '/records' }),
  getRecord: (id) => request({ url: `/records/${id}` }),
  retryRecord: (id) => request({ url: `/records/${id}/retry`, method: 'POST' }),
  regenerateRecordImage: (id, index) =>
    request({ url: `/records/${id}/images/${index}/regenerate`, method: 'POST' }),
  localizeRecordImages: (id) =>
    request({ url: `/records/${id}/localize-images`, method: 'POST' }),
  resumeTasks: () => request({ url: '/records/resume', method: 'POST' }),
  getLogsMeta: () => request({ url: '/logs/meta' }),
  getLogs: (params = {}) => {
    const q = new URLSearchParams();
    if (params.taskId) q.set('taskId', params.taskId);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.before) q.set('before', params.before);
    const qs = q.toString();
    return request({ url: `/logs${qs ? `?${qs}` : ''}` });
  },
  getHotTopics: (params = {}) => {
    const q = new URLSearchParams();
    if (params.templateId) q.set('templateId', params.templateId);
    if (params.templateName) q.set('templateName', params.templateName);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.refresh) q.set('refresh', '1');
    const qs = q.toString();
    return request({ url: `/hot${qs ? `?${qs}` : ''}` });
  }
};
