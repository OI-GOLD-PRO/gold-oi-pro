#!/bin/sh
set -eu
cd "$(dirname "$0")"
cp ../downloads/OI-Gold-AI-Trader-Demo.zip payload.zip
trap 'rm -f payload.zip' EXIT
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o ../downloads/OI-Gold-AI-Trader-Setup-x64.exe main.go
