import { defineStore } from 'pinia';
import { api } from '../utils/request.js';
import { clearRecordsCache } from '../utils/recordsCache.js';
import { clearImageUrlCache } from '../utils/imageUrlCache.js';

export const useUserStore = defineStore('user', {
  state: () => ({
    token: uni.getStorageSync('token') || '',
    user: null
  }),
  getters: {
    isLogin: (state) => !!state.token
  },
  actions: {
    async login(phone, password, opts = {}) {
      const data = await api.login(phone, password, opts);
      this.token = data.token;
      this.user = data.user;
      uni.setStorageSync('token', data.token);
    },
    async register(phone, password, opts = {}) {
      await api.register(phone, password, opts);
      // 注册成功后自动登录，减少一次跳转
      await this.login(phone, password, {
        acceptedTerms: Boolean(opts.acceptedTerms)
      });
    },
    async fetchUser() {
      if (!this.token) return;
      this.user = await api.getMe();
    },
    logout() {
      const uid = this.user?.id;
      this.token = '';
      this.user = null;
      uni.removeStorageSync('token');
      if (uid) {
        clearRecordsCache(uid);
        clearImageUrlCache(uid);
      }
    },
    checkLogin() {
      if (!this.token) {
        uni.navigateTo({ url: '/pages/login/login' });
        return false;
      }
      return true;
    }
  }
});
