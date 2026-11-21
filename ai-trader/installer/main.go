package main

import (
	"archive/zip"
	"bytes"
	_ "embed"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

//go:embed payload.zip
var payload []byte

//go:embed install.ps1
var script []byte

func install() error {
	root := os.Getenv("LOCALAPPDATA")
	if root == "" {
		return fmt.Errorf("LOCALAPPDATA is unavailable")
	}
	base := filepath.Join(root, "OI Gold AI Trader")
	if err := os.MkdirAll(base, 0700); err != nil {
		return err
	}
	dir, err := os.MkdirTemp(base, "release-")
	if err != nil {
		return err
	}
	archive, err := zip.NewReader(bytes.NewReader(payload), int64(len(payload)))
	if err != nil {
		return err
	}
	for _, item := range archive.File {
		name := filepath.FromSlash(item.Name)
		if !filepath.IsLocal(name) || strings.Contains(name, ":") {
			return fmt.Errorf("invalid package path")
		}
		path := filepath.Join(dir, name)
		if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
			return err
		}
		in, err := item.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			in.Close()
			return err
		}
		_, copyErr := io.Copy(out, in)
		closeErr := out.Close()
		in.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	setup := filepath.Join(dir, "install.ps1")
	if err = os.WriteFile(setup, script, 0600); err != nil {
		return err
	}
	cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "RemoteSigned", "-File", setup)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
func main() {
	if err := install(); err != nil {
		fmt.Println("Installation stopped:", err)
		fmt.Print("Press Enter to close.")
		fmt.Scanln()
		os.Exit(1)
	}
}
