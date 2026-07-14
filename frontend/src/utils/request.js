const BASE_URL = '/api';

function getToken() {
  return uni.getStorageSync('token') || '';
}

export function request({ url, method = 'GET', data }) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE_URL + url,
      method,
      data,
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
      fail: (err) => reject(err)
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
  login: (phone, password) => request({ url: '/auth/login', method: 'POST', data: { phone, password } }),
  register: (phone, password, inviteCode) =>
    request({ url: '/auth/register', method: 'POST', data: { phone, password, inviteCode } }),
  getMe: () => request({ url: '/user/me' }),
  getMemberPlans: () => request({ url: '/membership/plans' }),
  getMembershipMe: () => request({ url: '/membership/me' }),
  createMemberOrder: (planId) =>
    request({ url: '/membership/order', method: 'POST', data: { planId } }),
  payMemberOrder: (orderId) =>
    request({ url: '/membership/pay', method: 'POST', data: { orderId } }),
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
  resumeTasks: () => request({ url: '/records/resume', method: 'POST' }),
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
