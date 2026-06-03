---
name: web-summarize
description: Use this skill when the user wants to fetch a webpage and summarize its content. This includes reading articles, extracting key points from blog posts, summarizing documentation pages, or getting a quick overview of any URL. Use whenever the user provides a URL and asks for a summary, overview, or key points.
metadata:
  version: "0.1.0"
  author: keigent
  tags: [web, summarize, fetch]
---

# Web Page Summarization

Fetch a webpage and produce a structured summary of its content.

## Workflow

Follow these steps in order. Use `request_verification` after each major step.

### Step 1: Fetch the page

Use the `fetch_url` tool to retrieve the page content.

```
fetch_url(url="<the URL>")
```

After fetching, call `request_verification` with `checkpoint_desc="页面已抓取，准备总结"`.

### Step 2: Summarize

Read the fetched content and produce a summary with the following structure:

- **标题**：页面标题
- **一句话概述**：不超过 30 字
- **要点**：3-5 条关键信息（每条 1-2 句）
- **原文链接**：原始 URL

After producing the summary, call `request_verification` with `checkpoint_desc="总结已完成"`.

## Guidelines

- If the fetch fails (network error, 403, etc.), report the error clearly and stop. Do not guess the content.
- Keep each key point concise — one idea per bullet.
- Do not include advertisements, navigation menus, or boilerplate footer content in the summary.
- If the page is in a language other than Chinese, still produce the summary in Chinese.

## Quick Reference

| Step | Tool | Checkpoint |
|------|------|-----------|
| 1. 抓取页面 | `fetch_url` | `"页面已抓取，准备总结"` |
| 2. 产出总结 | (text output) | `"总结已完成"` |
