# Photoshop AI 网页联动插件

这个工程通过浏览器网页而非 API 调用 ChatGPT、通义千问和豆包：在 Photoshop 输入指令后，当前画布会交给已登录网页中的 Chrome 扩展上传。网页完成出图后，图片会作为一个新图层放回当前 Photoshop 文档。

## 使用前提

- Chrome 中已登录目标服务，并有可用的图片生成权限。
- 已打开对应服务的对话页面：ChatGPT、通义千问或豆包。
- Chrome 保持运行；目标标签页不需要一直处于前台。
- 目标网页功能及自动化使用方式须符合该平台当前服务条款。

## 一次性安装

1. 双击项目根目录的 `一键安装PS插件.cmd`，随后在 Adobe Creative Cloud 的提示中确认安装。安装完成后插件会持久保留，不需要每次再通过 UXP Developer Tool 加载；更新插件时重新双击即可。
2. 在使用 AI 网页的 Chromium 浏览器打开扩展管理页，开启“开发人员模式”。Chrome 使用 `chrome://extensions`，Edge 使用 `edge://extensions`。
3. 点击“加载解压缩的扩展”或“加载已解压的扩展程序”，选择 `browser-extension` 文件夹。
4. 保持扩展启用，并在同一个浏览器里打开、登录你要使用的 AI 网页。

## 每次启动

双击项目根目录唯一入口 `一键启动.bat`。连接成功后显示熊猫图案，并持续显示服务任务日志。关闭窗口会停止该窗口启动的 Service 和专用浏览器；日志也保存在 `server/logs`。连接成功不代表网页已经登录或生成图片成功。

也可以手动运行：

```powershell
cd server
node index.js
```

服务日志保存在 `server/logs`：

- `bridge-server.log`：启动、任务领取、完成和服务错误。
- `launcher.log`：一键启动及健康检查结果。
- `process-output.log` / `process-error.log`：后台进程标准输出和错误输出。

## 豆包后台运行

双击唯一入口 `一键启动.bat`，Node.js 会统一启动 `server/index.js`、可见的专用豆包浏览器和扩展。启动完成后命令行窗口保持打开。

当前采用可见窗口模式，请保持专用豆包浏览器打开。用户实测无窗口模式不能可靠发送消息；最小化和遮挡时能否正常运行尚需验证。登录状态保存在 `%LOCALAPPDATA%\AI-Link-Bridge\BrowserProfile`。本项目不会注册 Windows 开机启动项，只有手动点击一键启动后才会运行。浏览器启动记录写入 `server/logs/browser-launch.log`。

然后在 Photoshop 面板选择目标网页，输入指令，点击“发送到已登录网页并回贴”。勾选“上传当前画布”时，当前文档会先导出 PNG，网页扩展会自动上传它。

## 架构

```text
Photoshop UXP 面板 -> 本地桥接服务 -> 已登录 AI 网页中的 Chrome 扩展
Photoshop 新图层 <- 本地桥接服务 <- 网页生成图片
```

本地服务只绑定 `127.0.0.1`，不会把你的任务开放到局域网；扩展不读取也不传出浏览器 Cookie、密码或登录令牌。

## 已支持的网页地址

- ChatGPT：`chatgpt.com`、`chat.openai.com`
- 通义千问：`tongyi.aliyun.com`
- 豆包：`www.doubao.com`

## 网页变化时

这些网站经常调整输入框、上传按钮或结果画廊的页面结构。相关适配都集中在 [browser-extension/content.js](E:/桌面/工作文档/开发/联动插件/browser-extension/content.js)，主要是 `findComposer`、`findSubmitButton` 和 `candidateImages` 三个函数；页面改版后只需修正这些选择器。

当前版本一次只处理一个网页任务，等待上限为 4 分钟。它会取到网页中新出现的大尺寸图片作为结果；若一个回答里有多张图，会回贴最后一张。

## 图片格式保护

网页结果可能实际采用 PNG、JPEG、WebP 或 GIF。插件会读取文件头判断真实格式，再使用匹配的扩展名置入 Photoshop；如果网页返回的是 HTML 登录页、错误页、空内容或其他伪图片，会在面板日志中直接报错，不再把它伪装成 `.png` 交给 Photoshop。
