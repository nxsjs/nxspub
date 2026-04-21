# Neo-Brutalism 风格指南

## 目标

采用新粗犷主义（Neo-Brutalism）视觉语言：高对比、硬边框、硬阴影、密集信息层级。避免圆润科技风与玻璃拟态。

## 视觉原则

- 高对比：黑白为主，荧光绿为主强调色。
- 硬轮廓：核心卡片、按钮、输入框使用粗边框。
- 硬阴影：使用偏移硬阴影，不使用柔和模糊阴影。
- 强层级：标题与关键指标使用超粗字重、大写、紧凑字距。
- 一致语法：基础组件风格统一，避免页面间漂移。

## 颜色与主题

- 背景：`#FFFFFF`
- 主文本：`#000000`
- 主强调：`#CCFF00`
- 中性色：`#F6F6F6` / `#E2E2E2` / `#5B5B5B`
- 语义色：
- 成功：保持强调色体系
- 警告：高亮黄底 + 黑字
- 错误：`#B02500` / `#F95630`

## 字体

- 主字体：`Public Sans`
- 标题：`800~900` 字重、大写、紧字距
- 正文：`400~500`
- 标签/状态：`700`，小号大写

## 形状、边框、阴影

- 圆角：仅小圆角（`4px`），避免大圆角
- 标准边框：`2px solid #000`
- 标准阴影：`4px 4px 0 0 #000`
- 强调阴影：`4px 4px 0 0 #CCFF00`
- 按压态：缩小阴影并产生位移

## 组件基线

- 按钮：黑色边框 + 硬阴影 + 大写粗体
- 卡片：白底黑边；关键卡片可黑底荧光字
- 输入框：黑色硬边框；占位符低对比灰色
- Tabs/筛选：激活态必须有明显块级背景或下划线强调
- 表格：紧凑行高，表头高对比
- 状态徽标：纯色实心块，禁止渐变

## 动效

- 时长：`100~150ms`
- 禁止：柔和缓动、模糊过渡、复杂弹簧动画
- 建议：悬停换色、按压位移、轻量渐入

## 响应式

- 桌面（`>=1280`）：左导航 + 主内容双栏
- 平板（`>=768`）：侧栏半折叠，优先主面板
- 手机（`<768`）：单列堆叠，控制区折叠/抽屉
- 移动端保留硬边框与硬阴影风格

## 阴影模式

同一产品区域建议固定使用一种阴影体系。

### 模式 A：双层叠加阴影

- 视觉特征：白色分离层 + 黑色硬阴影
- 适合：高强调主按钮

```html
<button
  class="
  flex items-center gap-3 px-8 py-3
  text-black text-sm font-black tracking-widest
  bg-[#CCFF00] border-2 border-black rounded
  shadow-[4px_4px_0px_-2px_rgba(255,255,255,1),4px_4px_0px_0px_rgba(0,0,0,1)]
  transition-all duration-50 ease-out
  hover:brightness-[1.05]
  active:translate-x-0.5 active:translate-y-0.5
  active:shadow-none
"
>
  TEXT
</button>
```

### 模式 B：经典硬阴影

- 视觉特征：单层黑色硬阴影
- 适合：常规操作按钮与密集工具栏

```html
<button
  class="
  bg-[#CCFF00] border-2 border-black rounded px-6 py-2
  text-black text-sm font-black tracking-widest
  shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
  transition-all duration-50 ease-out
  hover:brightness-[1.05]
  active:translate-x-0.5 active:translate-y-0.5
  active:shadow-none
"
>
  Text
</button>
```

