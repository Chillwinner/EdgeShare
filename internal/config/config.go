package config

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type Config struct {
	AppID          string  `json:"appId"`
	AppSecret      string  `json:"appSecret"`
	AccountID      string  `json:"accountId"`
	AnalyticsToken string  `json:"analyticsToken"`
	QuotaWarnGB    float64 `json:"quotaWarnGb"`
	QuotaLimitGB   float64 `json:"quotaLimitGb"`
	Port           int     `json:"port"`
}

type PublicStatus struct {
	Configured        bool    `json:"configured"`
	HasAnalytics      bool    `json:"hasAnalytics"`
	AppID             string  `json:"appId,omitempty"`
	AppSecretMasked   string  `json:"appSecretMasked,omitempty"`
	AccountID         string  `json:"accountId,omitempty"`
	AnalyticsMasked   string  `json:"analyticsMasked,omitempty"`
	QuotaWarnGB       float64 `json:"quotaWarnGb"`
	QuotaLimitGB      float64 `json:"quotaLimitGb"`
	Port              int     `json:"port"`
}

type Store struct {
	mu        sync.RWMutex
	path      string
	cfg       Config
	hostToken string
}

func NewStore() (*Store, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	dir := filepath.Join(home, ".edgeshare")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	cfgPath := filepath.Join(dir, "config.json")
	if envPath := os.Getenv("EDGESHARE_CONFIG"); envPath != "" {
		cfgPath = envPath
	}

	s := &Store{
		path:      cfgPath,
		hostToken: randomHex(24),
		cfg: Config{
			QuotaWarnGB:  850,
			QuotaLimitGB: 950,
			Port:         8787,
		},
	}

	if data, err := os.ReadFile(cfgPath); err == nil {
		_ = json.Unmarshal(data, &s.cfg)
	}
	if s.cfg.QuotaWarnGB <= 0 {
		s.cfg.QuotaWarnGB = 850
	}
	if s.cfg.QuotaLimitGB <= 0 {
		s.cfg.QuotaLimitGB = 950
	}
	if s.cfg.Port <= 0 {
		s.cfg.Port = 8787
	}

	// Allow env overrides for headless/docker usage too
	if v := os.Getenv("CF_APP_ID"); v != "" {
		s.cfg.AppID = v
	}
	if v := os.Getenv("CF_APP_SECRET"); v != "" {
		s.cfg.AppSecret = v
	}
	if v := os.Getenv("CF_ACCOUNT_ID"); v != "" {
		s.cfg.AccountID = v
	}
	if v := os.Getenv("CF_ANALYTICS_TOKEN"); v != "" {
		s.cfg.AnalyticsToken = v
	}

	return s, nil
}

func (s *Store) HostToken() string {
	return s.hostToken
}

func (s *Store) Get() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg
}

func (s *Store) Update(in Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if in.AppID != "" {
		s.cfg.AppID = in.AppID
	}
	if in.AppSecret != "" {
		s.cfg.AppSecret = in.AppSecret
	}
	if in.AccountID != "" {
		s.cfg.AccountID = in.AccountID
	}
	if in.AnalyticsToken != "" {
		s.cfg.AnalyticsToken = in.AnalyticsToken
	}
	if in.QuotaWarnGB > 0 {
		s.cfg.QuotaWarnGB = in.QuotaWarnGB
	}
	if in.QuotaLimitGB > 0 {
		s.cfg.QuotaLimitGB = in.QuotaLimitGB
	}
	if in.Port > 0 {
		s.cfg.Port = in.Port
	}

	data, err := json.MarshalIndent(s.cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o600)
}

func (s *Store) PublicStatus(includeHostDetails bool) PublicStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	st := PublicStatus{
		Configured:   s.cfg.AppID != "" && s.cfg.AppSecret != "",
		HasAnalytics: s.cfg.AccountID != "" && s.cfg.AnalyticsToken != "",
		QuotaWarnGB:  s.cfg.QuotaWarnGB,
		QuotaLimitGB: s.cfg.QuotaLimitGB,
		Port:         s.cfg.Port,
	}
	if includeHostDetails {
		st.AppID = s.cfg.AppID
		st.AppSecretMasked = maskSecret(s.cfg.AppSecret)
		st.AccountID = s.cfg.AccountID
		st.AnalyticsMasked = maskSecret(s.cfg.AnalyticsToken)
	}
	return st
}

func maskSecret(v string) string {
	if v == "" {
		return ""
	}
	if len(v) <= 6 {
		return "••••••"
	}
	return "••••" + v[len(v)-4:]
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
