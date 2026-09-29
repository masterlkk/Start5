# Project Status — MVP V1

## 已完成
- 首页普通启动
- 大任务本地规则判断
- 任务缩小页
- 2/5/10 分钟统一计时业务逻辑
- 时间戳倒计时
- Pause / Resume
- Refresh Recovery
- Background Recovery
- Early End
- 5 分钟结束反馈
- 卡住原因分流
- 卡住后 2 分钟恢复
- 2 分钟 Rescue 完整状态机
- Rescue → 普通 5 分钟
- LocalStorage Repository
- chainId 去重统计
- History
- Service Worker 离线缓存
- 本地数据清除
- 自动核心逻辑测试

## 当前实现形态
零依赖原生 ES Modules H5/PWA MVP。

原因：当前构建环境无法联网安装 Next.js npm 依赖。业务模型已经按可迁移架构拆分，后续换 Next.js/React 只需要重写 UI 层和路由外壳。

## 下一阶段（不属于本轮 MVP）
- Next.js/React 迁移
- 真机 iOS/Android 手工 QA
- 产品埋点平台接入
- 用户测试反馈
- AI 任务缩小
- 通知、账号、云同步、付费
