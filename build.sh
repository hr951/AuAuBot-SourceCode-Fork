#!/bin/bash

echo "📦 Cookieファイル展開中..."
if [ -f ./cookie.b64.txt ]; then
  base64 -d ./cookie.b64.txt > /tmp/youtube_cookies.txt
  echo "✅ /tmp/youtube_cookies.txt にCookieを書き出しました"
else
  echo "⚠️ cookie.b64.txt が見つかりませんでした"
fi
