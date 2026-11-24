package cloudflare

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"edgeshare/internal/config"
)

const sfuBaseURL = "https://rtc.live.cloudflare.com/v1/apps"

type SFUClient struct {
	store     *config.Store
	analytics *AnalyticsClient
	http      *http.Client
}

func NewSFUClient(store *config.Store, analytics *AnalyticsClient) *SFUClient {
	return &SFUClient{
		store:     store,
		analytics: analytics,
		http:      &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *SFUClient) Proxy(method, subPath string, body []byte) (int, []byte, error) {
	cfg := c.store.Get()
	if cfg.AppID == "" || cfg.AppSecret == "" {
		return http.StatusServiceUnavailable, []byte(`{"error":"Cloudflare SFU App ID / Secret not configured"}`), nil
	}

	if c.analytics != nil && c.analytics.IsBlocked() {
		return http.StatusTooManyRequests, []byte(`{"error":"Monthly quota limit reached (circuit breaker active)"}`), nil
	}

	target := fmt.Sprintf("%s/%s%s", sfuBaseURL, cfg.AppID, subPath)
	var bodyReader io.Reader
	if len(body) > 0 {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequest(method, target, bodyReader)
	if err != nil {
		return http.StatusInternalServerError, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.AppSecret)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return http.StatusBadGateway, nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return http.StatusBadGateway, nil, err
	}
	return resp.StatusCode, respBody, nil
}

func (c *SFUClient) ICEServers() []byte {
	payload := map[string]any{
		"iceServers": []map[string]any{
			{
				"urls": []string{
					"stun:stun.cloudflare.com:3478",
					"stun:stun.l.google.com:19302",
				},
			},
		},
	}
	b, _ := json.Marshal(payload)
	return b
}
