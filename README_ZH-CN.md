# DeepSeek V4 Playground

体验最新的 **DeepSeek V4** 模型 - 通过一个提示生成小型应用程序。由 [EdgeOne Pages 边缘 AI](https://pages.edgeone.ai/zh/document/edge-ai) 提供支持。

## 亮点

- **DeepSeek V4**：最新、最强大的 DeepSeek 模型，具有增强的代码生成能力
- **边缘部署**：模型部署在全球边缘节点，提供低延迟响应
- **实时预览**：通过交互式沙箱即时预览代码

## 部署

[![使用 EdgeOne Pages 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new?template=deepseek-v4)

在线预览：https://deepseek-v4.edgeone.site

更多模板：[EdgeOne Pages](https://edgeone.ai/pages/templates)

## 技术栈

- [EdgeOne Pages 边缘 AI](https://pages.edgeone.ai/zh/document/edge-ai) 用于使用部署在全球边缘节点的 DeepSeek 模型生成代码
- [Sandpack](https://sandpack.codesandbox.io/) 用于代码沙箱
- 使用 Tailwind 的 Next.js App 路由

## 支持的模型

| 模型                              | 描述                        | 每日免费额度 |
| :-------------------------------- | :-------------------------- | :----------- |
| **`@tx/deepseek-ai/deepseek-v4`** | **最新 DeepSeek V4 - 推荐** | 50 次        |

了解更多关于边缘 AI：[EdgeOne Pages 边缘 AI 文档](https://pages.edgeone.ai/zh/document/edge-ai)

## 使用自己的 OpenAI API 兼容服务

如果需要无限制的 API 调用，可以使用任何 OpenAI API 兼容的服务（如 DeepSeek、OpenAI、Moonshot 等）：

1. 从您选择的服务商获取 API Key
2. 在 EdgeOne Pages 项目设置中配置以下环境变量：
   - `BASE_URL`：API 基础地址（如 `https://api.deepseek.com/v1`、`https://api.openai.com/v1`）
   - `API_KEY`：您的 API 密钥
   - `MODEL`：要使用的模型（如 `deepseek-chat`、`gpt-4o`）

当三个环境变量（`BASE_URL`、`API_KEY`、`MODEL`）都设置后，应用将直接使用您的自定义 API 服务而不是边缘 AI。

## 获取 OpenAI API 兼容服务

部署完成后，该项目会提供一个 **OpenAI API 兼容的接口**，您可以将其配置到各种 AI 工具和应用中使用：

- **接口地址**：`https://<your_domain>/v1/chat/completions`
- **兼容工具**：任何支持 OpenAI API 格式的 AI 工具和应用

只需将部署后的接口地址配置到您的 AI 工具中即可开始使用。
