# Start5 MVP v1.1 状态

## 已实现

- 普通任务5分钟启动
- 大任务本地规则识别与任务缩小
- 5分钟倒计时
- 暂停/继续
- 提前结束
- 时间戳计时
- 后台与锁屏后按真实时间恢复
- 页面刷新恢复活动 Session
- 结束反馈
- 继续10分钟
- 卡住原因分流
- 卡住后2分钟重试
- “我完全不想动”2分钟救急模式
- Rescue → 普通5分钟
- 今日启动次数
- chainId去重
- 历史与本周简单统计
- LocalStorage本地保存
- Service Worker离线缓存
- 清除本地数据
- Feedback幂等防重复
- 移动端响应式布局

## v1.1 部署修正

- 所有 JS 模块改为仓库根目录
- `app.js` 使用 `./domain.js`、`./timer.js`、`./storage.js`
- `sw.js` 同步使用根目录资源
- Service Worker 缓存更新为 `start5-v1.1.0`
- manifest 使用相对 `start_url` 与 `scope`，兼容 GitHub Pages 子路径
