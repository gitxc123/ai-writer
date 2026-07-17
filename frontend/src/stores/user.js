import { defineStore } from 'pinia';
import { api } from '../utils/request.js';

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
    async register(phone, password, inviteCode, opts = {}) {
      // 仅创建账号，不自动登录；注册成功后需用户回到登录页重新登录
      await api.register(phone, password, inviteCode, opts);
    },
    async fetchUser() {
      if (!this.token) return;
      this.user = await api.getMe();
    },
    logout() {
      this.token = '';
      this.user = null;
      uni.removeStorageSync('token');
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
