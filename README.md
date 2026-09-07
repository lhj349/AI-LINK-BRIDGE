# Photoshop AI 网页联动插件

在 Photoshop 中输入提示词，将当前画布发送到已登录的 AI 网页，生成图片后作为新图层置入 Photoshop。项目通过浏览器扩展操作网页，不直接调用生图 API，也不控制豆包 Windows 客户端。

## 当前运行方式

唯一日常入口是根目录的 `一键启动.bat`。它通过 Node.js 启动本地 Service、可见的专用豆包浏览器，并显示连接状态及实时任务日志。

- 请保持启动终端和专用豆包浏览器打开。
- 关闭启动终端，会清理该次启动的 Service 和专用浏览器。
- 关闭专用浏览器后，该页面不能继续接收或完成任务。
- 不启用 Windows 开机自启动。
- 无窗口（Headless）模式已撤掉。最小化、遮挡或切换标签页时能否稳定工作尚未验证；若操作停住，请将豆包窗口恢复到前台。
- 熊猫图案和 `READY` 表示服务及扩展已连接，不代表上传或出图已验证成功。

## 使用前提

- Windows，Photoshop 24.0 或以上版本。
- Node.js 已安装且加入 PATH，执行 `node --version` 有输出。Service 使用内置 fetch，需要支持该功能的 Node.js 版本（18 或以上）。
- 已安装 Microsoft Edge。启动器优先选择 Edge，找不到时尝试 Chrome；自动加载扩展受浏览器版本和策略影响，当前本机已验证 Edge 能加载。
- 在专用浏览器中登录豆包，并具备图片上传和生成权限。需要联网。

## 安装 Photoshop 插件

双击根目录的 `com.codex.ai-link-bridge-0.1.1.ccx`，通过 Adobe Creative Cloud 确认安装，然后在 Photoshop 插件菜单打开 **AI Link Bridge**。安装后无需每次通过 UXP Developer Tool 加载。

当前目录不再包含原先的一键安装脚本。CCX 是已打包文件，修改源码不会自动更新已安装插件。开发时可通过 UXP Developer Tool 加载根目录的 `manifest.json`；发布更新需重新打包。

## 首次登录与日常启动

1. 双击 `一键启动.bat`。
2. 按 **1** 启动服务并打开专用豆包窗口；不操作时 5 秒后默认选择 1。
3. 首次登录或登录失效时按 **2**，在专用窗口里手动完成登录，再关闭启动终端，重新启动并选择 1。
4. 等待连接提示，确认豆包页面可输入、上传图片。
5. 在 Photoshop 打开文档，选择豆包，输入提示词，点击 **开始生成**。
6. 保持专用豆包页面打开，等待结果置入 Photoshop 新图层。

登录配置保存在 `%LOCALAPPDATA%\AI-Link-Bridge\BrowserProfile`。它与平时使用的浏览器配置独立：普通浏览器已登录，不代表专用浏览器也已登录。

如果出现 `Service already running`，请关闭原启动窗口后再试。如果改过启动器代码，旧实例也必须结束后重启，才会使用新逻辑。

## 浏览器扩展与其他平台

启动器会尝试加载项目的 `browser-extension` 目录。未连接时，在专用浏览器的扩展管理页面检查 **AI Link Bridge** 是否存在并启用。

手动安装：Edge 打开 `edge://extensions`，Chrome 打开 `chrome://extensions`；开启开发人员模式，点击“加载已解压的扩展程序”，选择 `browser-extension` 文件夹。修改扩展源码后，重新加载扩展并刷新网页。

一键启动目前只自动打开豆包。扩展配置还包含以下平台适配，使用其他平台需要自行打开、登录并验证：

| 平台 | 匹配域名 |
| --- | --- |
| 豆包 | `doubao.com` 及其子域名 |
| ChatGPT | `chatgpt.com`、`chat.openai.com` |
| 千问 | `tongyi.aliyun.com`、`qianwen.com`、`www.qianwen.com`、`chat.qwen.ai` |

同一平台建议只保留一个启用扩展的任务页面。目前任务按平台领取，多个页面可能竞争领取；仅凭心跳无法判断具体连接的是哪个窗口。

## 日志与排错

日志保存在 `server/logs`。启动终端持续显示 `bridge-server.log` 的新增内容。

| 文件 | 用途 |
| --- | --- |
| `browser-launch.log` | 启动器、浏览器启动及连接结果 |
| `bridge-server.log` | Service 启动、任务排队、领取、完成及错误 |
| `process-output.log` | Service 标准输出 |
| `process-error.log` | Service 标准错误 |
| `launcher.log` | 旧版启动器历史日志，当前入口不再写入 |

可访问 `http://127.0.0.1:3187/health` 检查服务。`activeClients` 表示最近收到心跳的平台，不代表完整生图流程可用。

| 现象 | 处理方法 |
| --- | --- |
| `Service already running` / `EADDRINUSE` | 3187 已占用，关闭旧启动终端；如手动运行过 node index.js，停止对应进程后再试。 |
| 浏览器扩展未连接 | 确认专用浏览器已打开、扩展已加载，重新加载扩展并刷新网页。新版扩展检测到豆包登录按钮时不再发送心跳或领取任务。 |
| 未找到图片上传控件 | 检查任务所在页面是否已登录且支持上传；如仍显示“登录”，先完成专用浏览器登录。 |
| 提示词未输入 | 查看是否出现 `Job taken by browser extension`；未领取先查连接，已领取再查上传和控件错误。 |
| 切回浏览器才继续 | 恢复专用窗口到前台；当前未保证最小化或遮挡时可正常操作。 |
| 图片解码或格式错误 | 检查日志中的资源类型，可能取得占位图、错误页或无法解码的图片；不能仅修改扩展名。 |

## 图片处理与限制

当前流程会导出 Photoshop 画布为 JPEG，目标上传上限为 10 MiB；超过上限时尝试缩小尺寸并重新编码。当前面板没有可选的“上传当前画布”复选框。

浏览器把取得的可解码位图转换为 PNG，再交给 Service。Service 按文件头识别 PNG、JPEG、WebP、GIF；Photoshop 按实际格式使用对应扩展名。文件头识别不是完整的图片完整性校验。

结果检测会过滤地址明显标注为 SVG 的资源，但不能保证排除所有占位图。它依赖页面中新出现的大尺寸图片，不保证取得最终原图或多图回答中的全部图片。单个页面一次处理一个任务，等待图片上限为 4 分钟。

网页改版可能需要调整 `browser-extension/content.js` 中的输入框、上传、发送和结果图片选择逻辑。

## 项目结构与开发

| 路径 | 作用 |
| --- | --- |
| `一键启动.bat` | 唯一日常启动入口 |
| `server/background-launcher.js` | Service 与浏览器启动、终端日志、关闭时清理 |
| `server/index.js` | 本地桥接服务及任务队列 |
| `browser-extension/content.js` | 网页操作与结果图片转换 |
| `browser-extension/manifest.json` | 浏览器扩展配置 |
| `manifest.json`、`index.html`、`main.js`、`styles.css` | Photoshop UXP 插件源码 |

仅调试 Service 时，在项目目录执行：

```bat
cd server
node index.js
```

这只启动 Service，不打开豆包，也不受一键启动终端管理。在运行该命令的窗口按 Ctrl+C 停止。

Service 只监听 `127.0.0.1:3187`。画布和提示词会经浏览器发送到所选 AI 平台，并非离线生图；扩展不主动读取浏览器 Cookie、密码或登录令牌。
