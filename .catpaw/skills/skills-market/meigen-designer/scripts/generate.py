#!/usr/bin/env python3
"""
美境生图脚本
用法: python3 generate.py <prompt> <token_file> [--image <url>]...

参数:
  prompt      用户描述文本（支持长文本）
  token_file  token 文件路径（自动处理刷新/认证）
  --image     参考图片 URL，可多次指定（可选）

认证逻辑：
  脚本会自动调用认证脚本获取 access_token：
  1. 如果有 refresh_token，尝试刷新
  2. 刷新失败或无 refresh_token，走 CIBA 认证

conversation_id 会持久化到 token_file 同目录下的 conversation_id 文件，
同一会话（同目录）内复用，使美境接口能感知对话上下文。

成功时输出图片 URL（每行一个），失败时输出 ERROR: <原因> 并以非零退出码退出。
关键步骤以 [STEP] 前缀输出到 stderr，方便调用方展示进度。
"""

from __future__ import annotations  # Python 3.9 兼容：支持 | 联合类型语法

import sys
import json
import re
import uuid
import urllib.request
import urllib.error
import os


def _extract_urls_from_text(text: str) -> list[str]:
    """从任意文本中提取 <img>...<#img> 格式和裸 meituan 图片 URL"""
    urls: list[str] = []
    urls.extend(re.findall(r"<img>(.*?)<#img>", text))
    urls.extend(re.findall(r"(https?://p\d+\.meituan\.net/[^\s\"'<>]+\.(?:jpg|png|jpeg|gif|webp)\b[^\s\"'<>]*)", text))
    return urls


def _deep_extract(obj) -> list[str]:
    """递归遍历任意 JSON 结构，提取所有图片 URL。"""
    urls: list[str] = []
    if isinstance(obj, str):
        urls.extend(_extract_urls_from_text(obj))
        try:
            inner = json.loads(obj)
            urls.extend(_deep_extract(inner))
        except (json.JSONDecodeError, TypeError):
            pass
    elif isinstance(obj, dict):
        for v in obj.values():
            urls.extend(_deep_extract(v))
    elif isinstance(obj, list):
        for item in obj:
            urls.extend(_deep_extract(item))
    return urls


def _get_or_create_conversation_id(token_file: str) -> str:
    """获取或创建持久化的 conversation_id。

    conversation_id 保存在 token_file 同目录下的 conversation_id 文件中。
    首次调用时随机生成并写入文件，后续调用直接读取复用。
    """
    conv_id_file = os.path.join(os.path.dirname(os.path.abspath(token_file)), "conversation_id")

    if os.path.exists(conv_id_file):
        conv_id = open(conv_id_file).read().strip()
        if conv_id:
            return conv_id

    conv_id = str(uuid.uuid4())
    os.makedirs(os.path.dirname(conv_id_file), exist_ok=True)
    with open(conv_id_file, "w") as f:
        f.write(conv_id)
    print(f"[STEP] 🆕 创建新会话: {conv_id[:8]}...", file=sys.stderr, flush=True)
    return conv_id


def _build_content(prompt: str, image_urls: list[str] | None = None) -> str:
    """构建 userInput.content 内容。

    如果有参考图片 URL，将其以 markdown 图片语法附加到描述文本后面，
    让美境接口能同时接收文字描述和参考图。
    """
    parts = [prompt]
    if image_urls:
        parts.append("\n\n参考图片：")
        for i, url in enumerate(image_urls, 1):
            parts.append(f"![参考图{i}]({url})")
    return "\n".join(parts)


def _check_json_error(raw: bytes) -> None:
    """检查响应是否为 JSON 错误体（非 SSE 流）。

    美境接口在认证失败等情况下，HTTP 状态码仍返回 200，
    但 body 是一个 JSON 对象而非 SSE 流。例如：
    {"data":{"msg":"ssoid 过期","code":30001,"message":"auth failed",...},"status":401}

    检测到这种情况时，输出完整错误信息并以非零退出码退出。
    """
    text = raw.decode("utf-8", errors="replace").strip()

    # SSE 流的行以 "data:" 开头，JSON 错误体以 "{" 开头
    if not text.startswith("{"):
        return

    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        return

    # 检查是否包含错误信息
    status = obj.get("status")
    data = obj.get("data", {})

    if isinstance(data, dict) and (data.get("message") or data.get("msg") or data.get("code")):
        code = data.get("code", "unknown")
        message = data.get("message", data.get("msg", "未知错误"))
        msg_detail = data.get("msg", "")

        error_parts = [f"ERROR: 接口返回错误 (HTTP body status={status}, code={code})"]
        error_parts.append(f"  message: {message}")
        if msg_detail and msg_detail != message:
            error_parts.append(f"  msg: {msg_detail}")

        # 输出完整原始 JSON 方便调试
        error_parts.append(f"  原始响应: {text}")

        print("\n".join(error_parts), file=sys.stderr, flush=True)
        sys.exit(1)

    # 也检查顶层 error 字段（兜底）
    if obj.get("error") or obj.get("errMsg"):
        print(f"ERROR: 接口返回错误\n  原始响应: {text}", file=sys.stderr, flush=True)
        sys.exit(1)


def _get_access_token(token_file: str) -> str:
    """获取 access_token。

    自动处理刷新/重新认证逻辑：
    1. 如果有 refresh_token，尝试刷新
    2. 刷新失败或无 refresh_token，走 CIBA 认证

    返回 access_token 用于当前请求。
    """
    import subprocess

    token_dir = os.path.dirname(os.path.abspath(token_file))
    mis_id_file = os.path.join(token_dir, "mis_id")
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # 读取 misId
    mis_id = ""
    if os.path.exists(mis_id_file):
        mis_id = open(mis_id_file).read().strip()

    if not mis_id:
        print(f"ERROR: mis_id 文件不存在或为空: {mis_id_file}", file=sys.stderr)
        sys.exit(1)

    # 调用认证脚本（自动处理刷新/认证）
    print(f"[STEP] 🔐 获取 access_token...", file=sys.stderr, flush=True)

    result = subprocess.run(
        ["bash", os.path.join(script_dir, "get-meigen-token.sh"), mis_id, "--refresh"],
        capture_output=True,
        text=True,
        timeout=300
    )

    # 打印认证脚本的 stderr（显示缓存/刷新状态）
    if result.stderr:
        for line in result.stderr.strip().split('\n'):
            if line:
                print(f"[STEP] {line}", file=sys.stderr, flush=True)

    if result.returncode != 0:
        print(f"ERROR: 获取 access_token 失败", file=sys.stderr)
        sys.exit(1)

    access_token = result.stdout.strip()
    if not access_token:
        print(f"ERROR: 认证脚本未返回 access_token", file=sys.stderr)
        sys.exit(1)

    return access_token


def generate(prompt: str, token_file: str, image_urls: list[str] | None = None) -> list[str]:
    # 获取 access_token（自动刷新/认证）
    access_token = _get_access_token(token_file)

    conversation_id = _get_or_create_conversation_id(token_file)
    content = _build_content(prompt, image_urls)

    # 生成唯一 chatId（UUID）
    import uuid
    chat_id = str(uuid.uuid4())

    print(f"[STEP] 🚀 发送生图请求...", file=sys.stderr, flush=True)
    if image_urls:
        print(f"[STEP] 🖼️ 附带 {len(image_urls)} 张参考图", file=sys.stderr, flush=True)

    payload = json.dumps({
        "chatId": chat_id,
        "teamId": "SceneTeamGroup",
        "extra": "",
        "userInput": {"content": content},
        "tran": "async",
        "conversionId": conversation_id,
        "businessInfo": {
            "channelId": "Meigen-AgentV2-Skill"
        }
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://aidesign.meituan.com/design/gateway/catclaw/designAgent/runStream",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Cookie": f"2a7394863a_ssoid={access_token}"
        },
        method="POST"
    )

    # 创建 SSL 上下文
    import ssl
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE

    result_image_urls: list[str] = []
    event_count = 0
    last_event_types: list[str] = []

    try:
        with urllib.request.urlopen(req, timeout=300, context=ssl_context) as resp:
            print(f"[STEP] 📡 已连接，等待设计师响应...", file=sys.stderr, flush=True)
            content_type = resp.headers.get("Content-Type", "")

            buf = b""
            first_chunk = True
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    break
                buf += chunk

                # 首个 chunk 到达时，检测是否为 JSON 错误响应（非 SSE 流）
                if first_chunk:
                    first_chunk = False
                    _check_json_error(buf)

                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    line = line.decode("utf-8", errors="replace").strip()
                    if not line.startswith("data:"):
                        continue
                    try:
                        data = json.loads(line[5:])
                    except json.JSONDecodeError:
                        continue

                    et = data.get("eventType", "")
                    event_count += 1
                    last_event_types.append(et)

                    # === 输出关键步骤到 stderr ===
                    if et == "PLAN_RESULT_SUMMARY":
                        print(f"[STEP] 📋 设计完成，汇总结果中...", file=sys.stderr, flush=True)
                        response_text = data.get("eventData", {}).get("response", "")
                        urls = _extract_urls_from_text(response_text)
                        result_image_urls.extend(urls)

                    elif et == "AGENT_EVENT":
                        ed = data.get("eventData", {})
                        evt_type = ed.get("type", "")

                        if evt_type == "TOOL_CALL":
                            tool_name = ed.get("tool_name", "未知工具")
                            print(f"[STEP] 🔧 调用工具: {tool_name}", file=sys.stderr, flush=True)

                        elif evt_type == "TOOL_RESPONSE":
                            tool_name = ed.get("tool_name", "")
                            print(f"[STEP] ✅ 工具返回: {tool_name}", file=sys.stderr, flush=True)
                            urls = _deep_extract(ed.get("tool_results", ""))
                            result_image_urls.extend(urls)

                        elif evt_type == "AGENT_ANSWER":
                            resp_text = ed.get("response", "")
                            summary = resp_text[:80].replace("\n", " ").strip()
                            if summary:
                                print(f"[STEP] 💬 设计师: {summary}{'...' if len(resp_text) > 80 else ''}", file=sys.stderr, flush=True)
                            urls = _deep_extract(resp_text)
                            result_image_urls.extend(urls)

                        elif evt_type == "LLM_RESPONSE":
                            resp_text = ed.get("response", "")
                            urls = _deep_extract(resp_text)
                            result_image_urls.extend(urls)

                        elif evt_type == "PLAN_START":
                            plan_name = ed.get("plan_name", ed.get("name", ""))
                            if plan_name:
                                print(f"[STEP] 🎯 开始规划: {plan_name}", file=sys.stderr, flush=True)
                            else:
                                print(f"[STEP] 🎯 设计师开始规划任务...", file=sys.stderr, flush=True)

                        elif evt_type == "AGENT_START":
                            agent_name = ed.get("agent_name", ed.get("name", ""))
                            if agent_name:
                                print(f"[STEP] 🤖 启动 Agent: {agent_name}", file=sys.stderr, flush=True)

                        elif evt_type == "THINKING":
                            thinking = ed.get("content", ed.get("thinking", ""))
                            summary = thinking[:80].replace("\n", " ").strip()
                            if summary:
                                print(f"[STEP] 🧠 思考中: {summary}{'...' if len(thinking) > 80 else ''}", file=sys.stderr, flush=True)

                    elif et == "TASK_STATUS":
                        status = data.get("eventData", {}).get("status", "")
                        if status:
                            print(f"[STEP] 📌 任务状态: {status}", file=sys.stderr, flush=True)

            # 流读完后，如果 buf 还有剩余内容且没解析到任何事件，再检查一次
            if event_count == 0 and buf:
                _check_json_error(buf)

    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            pass
        print(f"ERROR: HTTP {e.code} - {e.reason}. Body: {body}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"ERROR: 网络错误 - {e.reason}", file=sys.stderr)
        sys.exit(1)
    except TimeoutError:
        print("ERROR: 请求超时（300s），请重试", file=sys.stderr)
        sys.exit(1)

    result = list(dict.fromkeys(result_image_urls))  # 去重保序

    if not result:
        print(f"DEBUG: 共处理 {event_count} 个事件，类型: {list(set(last_event_types))}", file=sys.stderr)

    print(f"[STEP] 🎉 共处理 {event_count} 个事件，获取 {len(result)} 张图片", file=sys.stderr, flush=True)

    return result


def _parse_args(argv: list[str]) -> tuple[str, str, list[str]]:
    """解析命令行参数，提取 prompt、token_file 和 --image URL 列表。"""
    image_urls: list[str] = []
    positional: list[str] = []
    i = 0
    while i < len(argv):
        if argv[i] == "--image" and i + 1 < len(argv):
            image_urls.append(argv[i + 1])
            i += 2
        else:
            positional.append(argv[i])
            i += 1

    if len(positional) < 2:
        print("用法: python3 generate.py <prompt> <token_file> [--image <url>]...", file=sys.stderr)
        sys.exit(1)

    return positional[0], positional[1], image_urls


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python3 generate.py <prompt> <token_file> [--image <url>]...", file=sys.stderr)
        sys.exit(1)

    prompt, token_file, image_urls = _parse_args(sys.argv[1:])

    urls = generate(prompt, token_file, image_urls if image_urls else None)

    if not urls:
        print("ERROR: 未获取到图片，请检查 prompt 或重试", file=sys.stderr)
        sys.exit(1)

    for url in urls:
        print(url)
