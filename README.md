# DeepSeek V4 Playground

Experience the latest **DeepSeek V4** model - generate small apps with one prompt. Powered by [EdgeOne Pages Edge AI](https://pages.edgeone.ai/document/edge-ai).

## Highlights

- **DeepSeek V4**: The newest and most powerful DeepSeek model with enhanced code generation capabilities
- **Edge Deployment**: Models deployed on global edge nodes for low-latency responses
- **Live Preview**: Instant code preview with interactive sandbox

## Deploy

[![Deploy with EdgeOne Pages](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?template=deepseek-v4)

Live Demo: https://deepseek-v4.edgeone.site

More Templates: [EdgeOne Pages](https://edgeone.ai/pages/templates)

## Tech Stack

- [EdgeOne Pages Edge AI](https://pages.edgeone.ai/document/edge-ai) for code generation using DeepSeek models deployed on global edge nodes
- [Sandpack](https://sandpack.codesandbox.io/) for the code sandbox
- Next.js app router with Tailwind

## Supported Models

| Model                             | Description                          | Daily Free Quota |
| :-------------------------------- | :----------------------------------- | :--------------- |
| **`@tx/deepseek-ai/deepseek-v4`** | **Latest DeepSeek V4 - Recommended** | 50               |

Learn more about Edge AI: [EdgeOne Pages Edge AI Documentation](https://pages.edgeone.ai/document/edge-ai)

## Using Your Own OpenAI API-Compatible Service

If you need unlimited API calls, you can use any OpenAI API-compatible service (such as DeepSeek, OpenAI, Moonshot, etc.):

1. Get an API key from your preferred provider
2. Set the following environment variables in your EdgeOne Pages project settings:
   - `BASE_URL`: The API base URL (e.g., `https://api.deepseek.com/v1`, `https://api.openai.com/v1`)
   - `API_KEY`: Your API key
   - `MODEL`: The model to use (e.g., `deepseek-chat`, `gpt-4o`)

When all three environment variables (`BASE_URL`, `API_KEY`, `MODEL`) are set, the app will use your custom API service directly instead of Edge AI.

## Get Your Own OpenAI API-Compatible Endpoint

Once deployed, this project provides an **OpenAI API-compatible endpoint** that you can integrate with various AI tools and applications:

- **Endpoint**: `https://<your_domain>/v1/chat/completions`
- **Compatible with**: Any AI tools and applications that support OpenAI API format

Simply configure your AI tools with your deployed endpoint URL to start using the service.
