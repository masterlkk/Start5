#!/bin/bash
cd "$(dirname "$0")"
PORT=4173
python3 -m http.server "$PORT" >/tmp/start5-mvp-server.log 2>&1 &
SERVER_PID=$!
sleep 0.7
if command -v open >/dev/null 2>&1; then
  open "http://localhost:$PORT"
else
  echo "请在浏览器打开 http://localhost:$PORT"
fi
echo "先做5分钟正在运行：http://localhost:$PORT"
echo "关闭此窗口或按 Ctrl+C 可停止。"
trap 'kill $SERVER_PID 2>/dev/null' EXIT INT TERM
wait $SERVER_PID
