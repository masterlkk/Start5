# 先做5分钟 / Start5

一个帮助用户从“知道要做，但不想开始”切换到“先行动一点”的极简任务启动器。

## GitHub Pages 版

本版本专门针对 GitHub Pages 做了扁平化处理：**所有运行文件都位于仓库根目录**，不依赖 `src/` 文件夹。

核心运行文件：

- `index.html`
- `styles.css`
- `app.js`
- `domain.js`
- `timer.js`
- `storage.js`
- `sw.js`
- `manifest.webmanifest`
- `icon.svg`

## GitHub Pages 部署

1. 把本目录中的所有文件上传到仓库根目录。
2. 确认 `index.html` 和 `app.js` 在仓库首页直接可见。
3. Repository → Settings → Pages。
4. Source 选择 `Deploy from a branch`。
5. Branch 选择 `main`，Folder 选择 `/(root)`。
6. 保存并等待 Pages 构建完成。
7. 访问：`https://<用户名>.github.io/<仓库名>/`

例如：

`https://masterlkk.github.io/Start5/`

## 更新旧版本时的重要步骤

如果此前已经访问过旧版本，请部署完成后：

- 强制刷新：Mac `Command + Shift + R`
- 或使用无痕窗口访问

本版本的 Service Worker 缓存名已更新为 `start5-v1.1.0`，用于淘汰旧缓存。

## 本地运行

Mac/Linux：

```bash
python3 -m http.server 4173
```

访问：

`http://localhost:4173/`

也可以在 macOS 运行 `bash start.command`。

## 测试

如果安装了 Node.js：

```bash
npm test
```

## 隐私

第一版不要求账号。任务文本与专注记录默认只保存在浏览器 LocalStorage 中，不会默认上传任务文本。
