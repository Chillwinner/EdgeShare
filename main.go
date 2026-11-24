package main

import (
	"embed"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"edgeshare/internal/cloudflare"
	"edgeshare/internal/config"
	"edgeshare/internal/room"
	"edgeshare/internal/tunnel"
)

//go:embed all:web/dist
var webDistFS embed.FS

func main() {
	noOpen := flag.Bool("no-open", false, "do not automatically open browser on startup")
	portFlag := flag.Int("port", 0, "override HTTP listen port")
	flag.Parse()

	store, err := config.NewStore()
	if err != nil {
		log.Fatalf("init config: %v", err)
	}

	port := store.Get().Port
	if *portFlag > 0 {
		port = *portFlag
	}

	analytics := cloudflare.NewAnalyticsClient(store)
	sfu := cloudflare.NewSFUClient(store, analytics)
	tun := tunnel.NewManager(port)
	hub := room.NewHub(store.HostToken())

	isHostReq := func(r *http.Request) bool {
		tok := r.Header.Get("X-Host-Token")
		if tok == "" {
			tok = r.URL.Query().Get("hostToken")
		}
		if tok != "" && tok == store.HostToken() {
			return true
		}
		// Treat direct local loopback access (without reverse-proxy headers) as Host
		if r.Header.Get("CF-Connecting-IP") == "" && r.Header.Get("X-Forwarded-For") == "" {
			hostOnly, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				hostOnly = r.RemoteAddr
			}
			ip := net.ParseIP(hostOnly)
			reqHost := strings.ToLower(r.Host)
			if ip != nil && ip.IsLoopback() && (strings.HasPrefix(reqHost, "127.0.0.1") || strings.HasPrefix(reqHost, "localhost")) {
				return true
			}
		}
		return false
	}

	hostOnly := func() gin.HandlerFunc {
		return func(c *gin.Context) {
			if !isHostReq(c.Request) {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "host token required"})
				return
			}
			c.Next()
		}
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())

	api := r.Group("/api")
	{
		api.GET("/status", func(c *gin.Context) {
			isHost := isHostReq(c.Request)
			c.JSON(http.StatusOK, gin.H{
				"isHost": isHost,
				"config": store.PublicStatus(isHost),
				"tunnel": tun.Status(),
				"quota":  analytics.GetQuota(false),
			})
		})

		api.GET("/quota", func(c *gin.Context) {
			force := c.Query("force") == "1" && isHostReq(c.Request)
			c.JSON(http.StatusOK, analytics.GetQuota(force))
		})

		api.GET("/ice-servers", func(c *gin.Context) {
			c.Data(http.StatusOK, "application/json", sfu.ICEServers())
		})

		api.Any("/sfu/*subpath", func(c *gin.Context) {
			subPath := c.Param("subpath")
			if subPath == "" || subPath == "/" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid sfu path"})
				return
			}
			body, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			code, respBody, err := sfu.Proxy(c.Request.Method, subPath, body)
			if err != nil {
				log.Printf("[SFU %s %s] error: %v", c.Request.Method, subPath, err)
				c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
				return
			}
			if code >= 400 {
				log.Printf("[SFU %s %s] HTTP %d: %s", c.Request.Method, subPath, code, string(respBody))
			}
			c.Data(code, "application/json", respBody)
		})

		// Host-only management routes
		host := api.Group("", hostOnly())
		{
			host.POST("/config", func(c *gin.Context) {
				var in config.Config
				if err := c.ShouldBindJSON(&in); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}
				if err := store.Update(in); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, gin.H{
					"config": store.PublicStatus(true),
					"quota":  analytics.GetQuota(true),
				})
			})

			host.POST("/tunnel/start", func(c *gin.Context) {
				c.JSON(http.StatusOK, tun.Start())
			})
			host.POST("/tunnel/stop", func(c *gin.Context) {
				c.JSON(http.StatusOK, tun.Stop())
			})
			host.POST("/tunnel/install", func(c *gin.Context) {
				if err := tun.InstallBinary(); err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				c.JSON(http.StatusOK, tun.Status())
			})

			host.POST("/rooms", func(c *gin.Context) {
				var body struct {
					Password        string `json:"password"`
					MaxParticipants int    `json:"maxParticipants"`
					WaitingRoom     bool   `json:"waitingRoom"`
				}
				_ = c.ShouldBindJSON(&body)
				c.JSON(http.StatusOK, hub.CreateRoom(body.Password, body.MaxParticipants, body.WaitingRoom))
			})
		}
	}

	r.GET("/ws", func(c *gin.Context) {
		hub.HandleWS(c.Writer, c.Request)
	})

	distSub, err := fs.Sub(webDistFS, "web/dist")
	if err != nil {
		log.Fatalf("embed web/dist: %v", err)
	}
	fileServer := http.FileServer(http.FS(distSub))
	r.NoRoute(func(c *gin.Context) {
		p := strings.TrimPrefix(c.Request.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if f, err := distSub.Open(p); err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}
		c.Request.URL.Path = "/"
		fileServer.ServeHTTP(c.Writer, c.Request)
	})

	addr := fmt.Sprintf(":%d", port)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	hostURL := fmt.Sprintf("http://127.0.0.1:%d/?hostToken=%s", port, store.HostToken())
	log.Printf("EdgeShare (Gin) started on http://127.0.0.1:%d", port)
	log.Printf("Host console: %s", hostURL)

	go func() {
		if !*noOpen {
			time.Sleep(350 * time.Millisecond)
			openBrowser(hostURL)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("Shutting down EdgeShare...")
		tun.Stop()
		_ = srv.Close()
	}()

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	}
	if cmd != nil {
		_ = cmd.Start()
	}
}
