package tunnel

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sync"
	"time"
)

var tryCloudflareRe = regexp.MustCompile(`https://[a-zA-Z0-9-]+\.trycloudflare\.com`)

type Status struct {
	HasBinary  bool   `json:"hasBinary"`
	Running    bool   `json:"running"`
	Installing bool   `json:"installing"`
	PublicURL  string `json:"publicUrl,omitempty"`
	LanURL     string `json:"lanUrl,omitempty"`
	Error      string `json:"error,omitempty"`
}

type Manager struct {
	mu         sync.Mutex
	port       int
	cmd        *exec.Cmd
	running    bool
	installing bool
	publicURL  string
	lastErr    string
}

func NewManager(port int) *Manager {
	return &Manager{port: port}
}

func (m *Manager) binPath() (string, bool) {
	if p, err := exec.LookPath("cloudflared"); err == nil {
		return p, true
	}
	home, _ := os.UserHomeDir()
	name := "cloudflared"
	if runtime.GOOS == "windows" {
		name = "cloudflared.exe"
	}
	localBin := filepath.Join(home, ".edgeshare", "bin", name)
	if _, err := os.Stat(localBin); err == nil {
		return localBin, true
	}
	return localBin, false
}

func (m *Manager) Status() Status {
	m.mu.Lock()
	defer m.mu.Unlock()

	_, hasBin := m.binPath()
	return Status{
		HasBinary:  hasBin,
		Running:    m.running,
		Installing: m.installing,
		PublicURL:  m.publicURL,
		LanURL:     fmt.Sprintf("http://%s:%d", detectLanIP(), m.port),
		Error:      m.lastErr,
	}
}

func (m *Manager) Start() Status {
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return m.Status()
	}
	bin, ok := m.binPath()
	if !ok {
		m.lastErr = "cloudflared not found; click Install to download automatically"
		m.mu.Unlock()
		return m.Status()
	}

	m.lastErr = ""
	m.publicURL = ""
	target := fmt.Sprintf("http://127.0.0.1:%d", m.port)
	cmd := exec.Command(bin, "tunnel", "--no-autoupdate", "--url", target)
	stderr, err := cmd.StderrPipe()
	if err != nil {
		m.lastErr = err.Error()
		m.mu.Unlock()
		return m.Status()
	}
	if err := cmd.Start(); err != nil {
		m.lastErr = err.Error()
		m.mu.Unlock()
		return m.Status()
	}

	m.cmd = cmd
	m.running = true
	m.mu.Unlock()

	urlCh := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			if match := tryCloudflareRe.FindString(line); match != "" {
				select {
				case urlCh <- match:
				default:
				}
			}
		}
		_ = cmd.Wait()
		m.mu.Lock()
		if m.cmd == cmd {
			m.running = false
			m.publicURL = ""
		}
		m.mu.Unlock()
	}()

	select {
	case u := <-urlCh:
		m.mu.Lock()
		m.publicURL = u
		m.mu.Unlock()
	case <-time.After(15 * time.Second):
		m.mu.Lock()
		if m.publicURL == "" {
			m.lastErr = "timed out waiting for trycloudflare.com URL"
		}
		m.mu.Unlock()
	}

	return m.Status()
}

func (m *Manager) Stop() Status {
	m.mu.Lock()
	if m.cmd != nil && m.cmd.Process != nil {
		_ = m.cmd.Process.Kill()
	}
	m.cmd = nil
	m.running = false
	m.publicURL = ""
	m.mu.Unlock()
	return m.Status()
}

func (m *Manager) InstallBinary() error {
	m.mu.Lock()
	if m.installing {
		m.mu.Unlock()
		return fmt.Errorf("already installing")
	}
	m.installing = true
	m.lastErr = ""
	m.mu.Unlock()

	defer func() {
		m.mu.Lock()
		m.installing = false
		m.mu.Unlock()
	}()

	url, err := cloudflaredDownloadURL()
	if err != nil {
		m.mu.Lock()
		m.lastErr = err.Error()
		m.mu.Unlock()
		return err
	}

	dest, _ := m.binPath()
	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return err
	}

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
	}

	// macOS releases are .tgz, linux/windows are raw binaries
	if runtime.GOOS == "darwin" {
		tgzPath := dest + ".tgz"
		f, err := os.Create(tgzPath)
		if err != nil {
			return err
		}
		_, err = io.Copy(f, resp.Body)
		f.Close()
		if err != nil {
			return err
		}
		defer os.Remove(tgzPath)

		cmd := exec.Command("tar", "-xzf", tgzPath, "-C", filepath.Dir(dest))
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("extract failed: %v (%s)", err, string(out))
		}
		return os.Chmod(dest, 0o755)
	}

	tmp := dest + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		return err
	}
	f.Close()
	return os.Rename(tmp, dest)
}

func cloudflaredDownloadURL() (string, error) {
	base := "https://github.com/cloudflare/cloudflared/releases/latest/download/"
	switch runtime.GOOS {
	case "darwin":
		if runtime.GOARCH == "arm64" {
			return base + "cloudflared-darwin-arm64.tgz", nil
		}
		return base + "cloudflared-darwin-amd64.tgz", nil
	case "linux":
		switch runtime.GOARCH {
		case "arm64":
			return base + "cloudflared-linux-arm64", nil
		case "amd64":
			return base + "cloudflared-linux-amd64", nil
		}
	case "windows":
		if runtime.GOARCH == "amd64" {
			return base + "cloudflared-windows-amd64.exe", nil
		}
	}
	return "", fmt.Errorf("unsupported OS/arch: %s/%s", runtime.GOOS, runtime.GOARCH)
}

func detectLanIP() string {
	conn, err := net.Dial("udp", "1.1.1.1:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()
	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}
