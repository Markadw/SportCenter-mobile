#!/usr/bin/env bash
# Host-side test tool only; no app dependency/build is changed.
set -euo pipefail
umask 077
test -n "$RUNNER_TEMP"
case "$(uname -sm)" in "Linux x86_64") ;; *) echo "Only Linux x86_64 is supported" >&2; exit 1;; esac
task_tool="$(mktemp -d "$RUNNER_TEMP/sport-pinning-tool-XXXXXX")"
archive="$task_tool/mitmproxy.tar.gz"
url='https://downloads.mitmproxy.org/12.3.1/mitmproxy-12.3.1-linux-x86_64.tar.gz'
digest='f7b4237f5702f6cd21357fe6e4680a7e905f8f9b816b872230d018ea696c34d5'
curl --fail --location --proto '=https' --tlsv1.2 --max-time 120 --output "$archive" "$url"
printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --status
tar -tzf "$archive" > "$task_tool/entries"
while IFS= read -r entry; do
  case "$entry" in mitmproxy|mitmdump|mitmweb) ;; *) echo "Unexpected archive entry" >&2; exit 1;; esac
done < "$task_tool/entries"
test "$(wc -l < "$task_tool/entries")" -eq 3
tar -xzf "$archive" --no-same-owner -C "$task_tool"
test -f "$task_tool/mitmdump" && test ! -L "$task_tool/mitmdump"
"$task_tool/mitmdump" --version | grep -E '^Mitmproxy: 12\.3\.1( binary)?$' > /dev/null
if printenv GITHUB_PATH > /dev/null; then printf '%s\n' "$task_tool" >> "$GITHUB_PATH"; fi
printf 'mitmproxy 12.3.1 verified; tool directory: %s\n' "$task_tool"
