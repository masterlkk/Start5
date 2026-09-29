# GitHub Pages 覆盖部署步骤

## 1. 删除/覆盖旧文件

在 GitHub `Start5` 仓库根目录中，新的同名文件直接覆盖旧文件即可。

本版不需要 `src/` 文件夹。运行时依赖全部在根目录。

## 2. 根目录必须能直接看到

- index.html
- app.js
- domain.js
- timer.js
- storage.js
- styles.css
- sw.js
- manifest.webmanifest
- icon.svg

## 3. Pages 设置

Repository → Settings → Pages

- Source: Deploy from a branch
- Branch: main
- Folder: /(root)

## 4. 构建后访问

https://masterlkk.github.io/Start5/

## 5. 如果还是显示旧页面/空白

先等待 Actions 中 Pages deployment 变成绿色成功状态，然后：

- Mac: Command + Shift + R
- 或无痕窗口打开网站
- 或浏览器 DevTools → Application → Service Workers → Unregister，再刷新

## 6. Custom domain

没有购买并配置 DNS 的域名时，不要填写 Custom domain。先使用默认 GitHub Pages 地址即可。
