# Stellar Homestead · 星垦

**🎮 Play online / 在线试玩: [larryyiguo.github.io/stellar-homestead](https://larryyiguo.github.io/stellar-homestead/)**

A 3D idle space-colony game with an upgradeable interstellar train and turn-based deck-building battles, built as a single-page Three.js app — no build step, nothing to install.

一款 3D 太空殖民放置养成游戏:可扩编的星际列车 + 回合制卡组战斗。纯前端 Three.js 单页应用,无需构建。

📖 Gameplay guide / 玩法说明 → **[GAMEPLAY.md](GAMEPLAY.md)**

---

## English

### How to run

| Method | Steps |
|---|---|
| **Online** | Open [larryyiguo.github.io/stellar-homestead](https://larryyiguo.github.io/stellar-homestead/) |
| **Local file** | Clone / download this repo, then double-click `index.html` (Three.js and fonts load from CDN, so an internet connection is required) |
| **Local server** | `python3 -m http.server 8736` in the repo root, then open `http://localhost:8736` |

### Saves & configuration

- Progress is saved automatically to your browser's **localStorage** (per site — the online and local versions keep separate saves).
- Development continues **offline**: everything is computed from real timestamps, so closing the page never pauses your colonies.
- The **gear button** (top right) opens the system panel: save now, **export / import** (paste the JSON to move a save between devices or between local and online), and full reset.
- The **speaker button** toggles the generative ambient BGM and voice lines.
- Saves from the original single-system *Stellar Homestead* are migrated automatically on first load.

### Development notes

- Plain HTML / CSS / JS. All numbers and content live in `js/data.js`; rendering in `js/render.js`; battles in `js/battle.js`; colony districts in `js/colony.js`; UI in `js/ui.js` / `js/trainui.js`.
- Local scripts are referenced with a `?v=N` cache-busting query in `index.html` — bump it whenever you edit JS/CSS.

### License

[MIT](LICENSE)

---

## 中文

### 怎么打开

| 方式 | 步骤 |
|---|---|
| **在线** | 直接打开 [larryyiguo.github.io/stellar-homestead](https://larryyiguo.github.io/stellar-homestead/) |
| **本地文件** | 克隆/下载本仓库,双击 `index.html` 即可(Three.js 与字体走 CDN,需联网) |
| **本地服务器** | 仓库根目录运行 `python3 -m http.server 8736`,打开 `http://localhost:8736` |

### 存档与配置

- 进度自动保存在浏览器 **localStorage**(按站点隔离——在线版与本地版存档互不相通)。
- **离线也在发展**:所有数值由真实时间戳推算,关掉页面殖民地照常生长。
- 右上角**齿轮按钮**打开系统面板:立即保存、**导出 / 导入**存档(复制 JSON 即可在设备间或本地/在线之间搬迁)、重新开始。
- **喇叭按钮**开关生成式环境音乐与语音。
- 原版单星系《星垦》的旧存档首次打开时自动迁移。

### 开发说明

- 纯 HTML / CSS / JS,无构建。数值与内容集中在 `js/data.js`;渲染 `js/render.js`;战斗 `js/battle.js`;界面 `js/ui.js` / `js/trainui.js`。
- 本地脚本在 `index.html` 中带 `?v=N` 缓存参数——改完 JS/CSS 记得把版本号 +1。

### 协议

[MIT](LICENSE)
