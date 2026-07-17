/** 简洁字段引导：标签 + 占位 + 类型快捷项；「写什么」示例由热门接口动态填充 */

const GUIDES = {
  小红书创作: {
    fields: {
      keyword: { label: '写什么', placeholder: '输入主题，或点选下方热门' },
      style: {
        label: '风格',
        placeholder: '点选或自填',
        options: ['真实分享', '闺蜜安利', '干货清单', '避雷吐槽', '情感故事', '探店打卡', '测评对比', '日常碎片']
      },
      length: { label: '字数', options: ['300', '450', '600'] }
    }
  },
  今日头条创作: {
    fields: {
      keyword: { label: '写什么', placeholder: '输入主题，或点选下方热门' },
      style: {
        label: '类型',
        placeholder: '点选或自填',
        options: [
          '时事新闻',
          '热点解读',
          '深度分析',
          '评论观点',
          '情感故事',
          '人物故事',
          '社会观察',
          '科普说明',
          '生活随笔',
          '职场故事'
        ]
      },
      length: { label: '字数', options: ['600', '800', '1200'] }
    }
  },
  公众号文案: {
    fields: {
      keyword: { label: '写什么', placeholder: '输入主题，或点选下方热门' },
      style: {
        label: '风格',
        placeholder: '点选或自填',
        options: ['干货分享', '故事共鸣', '情感故事', '方法论', '犀利观点', '温暖治愈', '人物专访风', '清单干货']
      },
      length: { label: '字数', options: ['800', '1000', '1500'] }
    }
  },
  抖音文案: {
    fields: {
      keyword: { label: '写什么', placeholder: '输入主题，或点选下方热门' },
      style: {
        label: '风格',
        placeholder: '点选或自填',
        options: ['幽默', '干货', '情绪共鸣', '情感故事', '反常识', '吐槽', '励志']
      },
      length: { label: '时长(秒)', options: ['30', '45', '60'] }
    }
  },
  产品介绍: {
    fields: {
      keyword: {
        label: '产品名称',
        placeholder: '输入产品叫什么，例如：便携榨汁杯',
        examples: ['便携榨汁杯', '降噪耳机', '氨基酸洗发水', '保温杯', '筋膜枪', '空气炸锅']
      },
      sellingPoint: {
        label: '产品卖点',
        placeholder: '点选下方卖点（可多选），也可自己输入'
      },
      style: {
        label: '卖给谁',
        placeholder: '点选或自填',
        options: ['上班族', '宝妈', '学生党', '商务人群', '银发群体', '户外运动党']
      },
      length: { label: '字数', options: ['150', '200', '300'] }
    }
  },
  一键改文: {
    fields: {
      article: {
        label: '原文',
        placeholder: '在此粘贴完整文章'
      },
      style: {
        label: '改写风格',
        placeholder: '点选或自填',
        options: ['更口语', '更专业', '小红书风', '公众号风', '新闻评论风', '简洁干货']
      },
      length: { label: '目标字数', options: ['与原文接近', '600', '1000', '1500'] }
    }
  },
  故事分镜提示词: {
    tip: '重点输出：每个分镜一条可独立粘贴的完整提示词。单镜时长是每镜时长；整片时长按故事自动估算',
    fields: {
      story: {
        label: '故事原文',
        placeholder: '粘贴故事段落、剧本或分场描述（最多 10000 字）'
      },
      platform: {
        label: '提示词平台',
        placeholder: '点选目标工具',
        options: ['通用', '即梦', '可灵', '豆包', 'Midjourney', 'Flux', 'Runway', '海螺视频']
      },
      style: {
        label: '画面风格',
        placeholder: '点选或自填',
        options: ['真人实拍', '二维动画', '三维CG', '口播短剧', '微电影', '广告片', '暗黑悬疑', '温暖治愈']
      },
      ratio: {
        label: '画面比例',
        placeholder: '点选画幅',
        options: ['9:16', '16:9', '1:1']
      },
      duration: {
        label: '单镜时长',
        placeholder: '每个分镜镜头的时长',
        options: ['5秒', '10秒', '15秒', '30秒', '45秒', '60秒', '90秒', '2分钟']
      },
      cameraMove: {
        label: '运镜方式',
        placeholder: '点选主导运镜',
        options: [
          '按剧情自动',
          '混合运镜',
          '固定镜头',
          '推镜头',
          '拉镜头',
          '摇镜头',
          '移镜头',
          '跟镜头',
          '升/降镜头',
          '环绕',
          '手持晃动'
        ]
      },
      requirements: {
        label: '额外要求',
        placeholder: '点选预置，也可自行补充',
        options: [
          '无字幕',
          '无声音',
          '无旁白',
          '无口播',
          '无文字出镜',
          '无人物正脸',
          '无品牌 Logo',
          '循环可播',
          '适合竖屏刷完'
        ]
      }
    }
  }
};

export function enrichTemplateFields(template) {
  if (!template) return { tip: '', fields: [] };
  const guide = GUIDES[template.name] || {};
  let rawFields = template.fields || [];
  if (typeof rawFields === 'string') {
    try {
      rawFields = JSON.parse(rawFields);
    } catch {
      rawFields = [];
    }
  }
  if (!Array.isArray(rawFields)) rawFields = [];
  const fields = rawFields.map((field) => {
    const extra = guide.fields?.[field.key] || {};
    return {
      ...field,
      label: extra.label || field.label,
      placeholder: extra.placeholder || '请输入',
      options: extra.options || [],
      examples: extra.examples || [],
      hint: ''
    };
  });
  return { tip: guide.tip || '', fields };
}
