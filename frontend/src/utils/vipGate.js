/** 会员拦截：统一开通路径（激活码 / 规则 / 客服） */

export function promptVipUpgrade(message = '请先开通会员后再创作') {
  uni.showModal({
    title: '需要开通会员',
    content: String(message || '请先开通会员后再创作'),
    confirmText: '开通方式',
    cancelText: '取消',
    success: (r) => {
      if (!r.confirm) return;
      uni.showActionSheet({
        itemList: ['激活码开通', '查看会员规则', '联系客服'],
        success: (sheet) => {
          const i = sheet.tapIndex;
          if (i === 0) uni.navigateTo({ url: '/pages/vip/activate' });
          else if (i === 1) uni.navigateTo({ url: '/pages/vip/index' });
          else if (i === 2) uni.navigateTo({ url: '/pages/mine/contact' });
        }
      });
    }
  });
}

export function goMineFallback() {
  uni.navigateBack({
    fail: () => uni.reLaunch({ url: '/pages/mine/index' })
  });
}
