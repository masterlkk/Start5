# 先做5分钟 — MVP V1

一个本地优先、零账号、零后端的极简任务启动器。

## 已实现

- 普通启动：输入任务 → 5分钟
- 大任务自动进入“任务缩小”
- 5分钟时间戳倒计时
- 暂停 / 恢复 / 提前结束
- 切后台、锁屏后按真实时间推进
- 页面刷新与重开恢复活动计时
- 5分钟结束反馈：继续10分钟 / 今天先这样 / 卡住原因
- 卡住后重新拆任务或再试2分钟
- “我完全不想动”2分钟救急模式
- Rescue → 普通5分钟
- 今日启动次数（按 chainId 去重）
- 简单历史记录与本周统计
- LocalStorage 本地保存
- Service Worker 离线缓存
- 本地数据清除
- 防重复 Feedback
- 基础无障碍与移动端安全区

## 运行

推荐通过本地 HTTP 服务运行，以启用 Service Worker：

```bash
cd start5-mvp
python3 -m http.server 4173
```

浏览器打开：

```text
http://localhost:4173
```

也可以执行：

```bash
npm run serve
```

`npm run serve` 不需要安装第三方 npm 依赖，实际调用系统 Python。

## 自动测试

```bash
npm test
```

使用 Node 内置测试运行器，不需要安装依赖。

## 路由

使用 Hash Router，静态托管和刷新时无需服务端 fallback：

- `#/` 首页
- `#/breakdown/:taskId` 任务缩小
- `#/focus/:sessionId` 统一计时
- `#/feedback/:sessionId` 结束反馈
- `#/rescue` 2分钟救急模式
- `#/history` 记录

## 存储

任务文本默认仅保存在浏览器 LocalStorage，不上传服务器。

主要 key：

- `sfm_tasks`
- `sfm_focus_sessions`
- `sfm_feedback`
- `sfm_rescue_sessions`
- `sfm_active_focus_session_id`
- `sfm_active_rescue_session_id`
- `sfm_schema_version`

## 设计原则

1. 任务不丢
2. 计时不漂
3. 刷新能恢复
4. 用户始终知道下一步按什么

## 当前技术形态

本环境无法联网安装 Next.js 依赖，因此首个可运行版本使用原生 ES Modules 实现，完全零依赖。领域模型、Repository、Timer、路由和状态机按既定规格拆分，后续迁移至 Next.js / React 时可直接复用数据模型与业务规则。
