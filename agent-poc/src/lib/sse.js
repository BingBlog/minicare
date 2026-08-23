/** SSE 事件发送工具（lib/sse.js） */
export function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}
