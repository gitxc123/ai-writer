<template>
  <view class="page">
    <input
      class="search"
      v-model="keyword"
      placeholder="搜索模板..."
      @input="filterTemplates"
    />

    <view v-for="cat in filtered" :key="cat.id" class="category">
      <text class="cat-name">{{ cat.name }}</text>
      <view class="tpl-list">
        <view
          v-for="tpl in cat.templates"
          :key="tpl.id"
          class="tpl-item"
          @click="openCreate(tpl.id)"
        >
          <text class="icon">{{ tpl.icon }}</text>
          <view class="info">
            <text class="name">{{ tpl.name }}</text>
            <text class="desc">{{ tpl.description }}</text>
          </view>
          <text class="arrow">›</text>
        </view>
      </view>
    </view>

    <view class="bottom-space" />
    <TabBar current="/pages/templates/index" />
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../../utils/request.js';
import { useUserStore } from '../../stores/user.js';
import TabBar from '../../components/TabBar.vue';

const categories = ref([]);
const filtered = ref([]);
const keyword = ref('');
const userStore = useUserStore();

onMounted(async () => {
  try {
    const list = await api.getCategories();
    // 双保险：前端再滤一次隐藏模板
    categories.value = (list || [])
      .map((cat) => ({
        ...cat,
        templates: (cat.templates || []).filter((t) => t?.name !== '产品介绍')
      }))
      .filter((cat) => (cat.templates || []).length > 0);
    filtered.value = categories.value;
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' });
  }
});

function filterTemplates() {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) {
    filtered.value = categories.value;
    return;
  }
  filtered.value = categories.value
    .map((cat) => ({
      ...cat,
      templates: cat.templates.filter(
        (t) => t.name.toLowerCase().includes(kw) || t.description.toLowerCase().includes(kw)
      )
    }))
    .filter((cat) => cat.templates.length > 0);
}

function openCreate(id) {
  if (!userStore.checkLogin()) return;
  uni.navigateTo({ url: `/pages/create/create?id=${id}` });
}
</script>

<style scoped>
.page {
  padding: 24rpx;
  padding-bottom: 140rpx;
}
.search {
  background: #fff;
  border-radius: 12rpx;
  padding: 20rpx 24rpx;
  margin-bottom: 24rpx;
  font-size: 28rpx;
}
.category {
  margin-bottom: 32rpx;
}
.cat-name {
  font-size: 30rpx;
  font-weight: 600;
  margin-bottom: 12rpx;
  display: block;
}
.tpl-item {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  display: flex;
  align-items: center;
}
.icon {
  font-size: 44rpx;
  margin-right: 20rpx;
}
.info {
  flex: 1;
}
.name {
  font-size: 28rpx;
  font-weight: 600;
  display: block;
}
.desc {
  font-size: 24rpx;
  color: #909399;
  margin-top: 4rpx;
  display: block;
}
.arrow {
  font-size: 36rpx;
  color: #c0c4cc;
}
.bottom-space {
  height: 40rpx;
}
</style>
