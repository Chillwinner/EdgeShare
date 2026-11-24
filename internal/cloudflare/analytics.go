package cloudflare

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"edgeshare/internal/config"
)

const graphqlEndpoint = "https://api.cloudflare.com/client/v4/graphql"
const freeMonthlyLimitGB = 1000.0

type QuotaSnapshot struct {
	Available       bool      `json:"available"`
	UsedBytes       uint64    `json:"usedBytes"`
	SFUBytes        uint64    `json:"sfuBytes"`
	TURNBytes       uint64    `json:"turnBytes"`
	UsedGB          float64   `json:"usedGb"`
	FreeLimitGB     float64   `json:"freeLimitGb"`
	WarnThresholdGB float64   `json:"warnThresholdGb"`
	LimitGB         float64   `json:"limitGb"`
	PercentUsed     float64   `json:"percentUsed"`
	Warning         bool      `json:"warning"`
	Blocked         bool      `json:"blocked"`
	LastSyncedAt    time.Time `json:"lastSyncedAt"`
	Error           string    `json:"error,omitempty"`
}

type AnalyticsClient struct {
	store *config.Store
	http  *http.Client

	mu       sync.Mutex
	cached   QuotaSnapshot
	lastSync time.Time
}

func NewAnalyticsClient(store *config.Store) *AnalyticsClient {
	return &AnalyticsClient{
		store: store,
		http:  &http.Client{Timeout: 15 * time.Second},
	}
}

func (a *AnalyticsClient) IsBlocked() bool {
	snap := a.GetQuota(false)
	return snap.Blocked
}

func (a *AnalyticsClient) GetQuota(force bool) QuotaSnapshot {
	cfg := a.store.Get()

	a.mu.Lock()
	defer a.mu.Unlock()

	if cfg.AccountID == "" || cfg.AnalyticsToken == "" {
		return QuotaSnapshot{
			Available:       false,
			FreeLimitGB:     freeMonthlyLimitGB,
			WarnThresholdGB: cfg.QuotaWarnGB,
			LimitGB:         cfg.QuotaLimitGB,
		}
	}

	if !force && !a.lastSync.IsZero() && time.Since(a.lastSync) < 5*time.Minute {
		snap := a.cached
		snap.WarnThresholdGB = cfg.QuotaWarnGB
		snap.LimitGB = cfg.QuotaLimitGB
		snap.Warning = snap.UsedGB >= cfg.QuotaWarnGB
		snap.Blocked = snap.UsedGB >= cfg.QuotaLimitGB
		return snap
	}

	snap, err := a.fetchFromCloudflare(cfg)
	if err != nil {
		if !a.lastSync.IsZero() {
			fallback := a.cached
			fallback.Error = err.Error()
			return fallback
		}
		return QuotaSnapshot{
			Available:       false,
			FreeLimitGB:     freeMonthlyLimitGB,
			WarnThresholdGB: cfg.QuotaWarnGB,
			LimitGB:         cfg.QuotaLimitGB,
			Error:           err.Error(),
		}
	}

	a.cached = snap
	a.lastSync = time.Now()
	return snap
}

func (a *AnalyticsClient) fetchFromCloudflare(cfg config.Config) (QuotaSnapshot, error) {
	now := time.Now().UTC()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	query := `
query($accountTag: String!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      callsUsageAdaptiveGroups(
        filter: { datetimeMinute_geq: $start, datetimeMinute_leq: $end }
        limit: 1
      ) {
        sum { egressBytes }
      }
      callsTurnUsageAdaptiveGroups(
        filter: { datetimeMinute_geq: $start, datetimeMinute_leq: $end }
        limit: 1
      ) {
        sum { egressBytes }
      }
    }
  }
}`

	payload := map[string]any{
		"query": query,
		"variables": map[string]any{
			"accountTag": cfg.AccountID,
			"start":      monthStart.Format(time.RFC3339),
			"end":        now.Format(time.RFC3339),
		},
	}

	raw, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, graphqlEndpoint, bytes.NewReader(raw))
	if err != nil {
		return QuotaSnapshot{}, err
	}
	req.Header.Set("Authorization", "Bearer "+cfg.AnalyticsToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := a.http.Do(req)
	if err != nil {
		return QuotaSnapshot{}, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return QuotaSnapshot{}, err
	}
	if resp.StatusCode != http.StatusOK {
		return QuotaSnapshot{}, fmt.Errorf("cloudflare graphql HTTP %d: %s", resp.StatusCode, string(body))
	}

	var parsed struct {
		Data struct {
			Viewer struct {
				Accounts []struct {
					CallsUsage []struct {
						Sum struct {
							EgressBytes uint64 `json:"egressBytes"`
						} `json:"sum"`
					} `json:"callsUsageAdaptiveGroups"`
					TurnUsage []struct {
						Sum struct {
							EgressBytes uint64 `json:"egressBytes"`
						} `json:"sum"`
					} `json:"callsTurnUsageAdaptiveGroups"`
				} `json:"accounts"`
			} `json:"viewer"`
		} `json:"data"`
		Errors []struct {
			Message string `json:"message"`
		} `json:"errors"`
	}

	if err := json.Unmarshal(body, &parsed); err != nil {
		return QuotaSnapshot{}, err
	}
	if len(parsed.Errors) > 0 {
		return QuotaSnapshot{}, fmt.Errorf("graphql error: %s", parsed.Errors[0].Message)
	}

	var sfuBytes, turnBytes uint64
	if len(parsed.Data.Viewer.Accounts) > 0 {
		acc := parsed.Data.Viewer.Accounts[0]
		for _, g := range acc.CallsUsage {
			sfuBytes += g.Sum.EgressBytes
		}
		for _, g := range acc.TurnUsage {
			turnBytes += g.Sum.EgressBytes
		}
	}

	totalBytes := sfuBytes + turnBytes
	usedGB := float64(totalBytes) / (1024 * 1024 * 1024)
	pct := (usedGB / freeMonthlyLimitGB) * 100.0
	if pct > 100 {
		pct = 100
	}

	return QuotaSnapshot{
		Available:       true,
		UsedBytes:       totalBytes,
		SFUBytes:        sfuBytes,
		TURNBytes:       turnBytes,
		UsedGB:          usedGB,
		FreeLimitGB:     freeMonthlyLimitGB,
		WarnThresholdGB: cfg.QuotaWarnGB,
		LimitGB:         cfg.QuotaLimitGB,
		PercentUsed:     pct,
		Warning:         usedGB >= cfg.QuotaWarnGB,
		Blocked:         usedGB >= cfg.QuotaLimitGB,
		LastSyncedAt:    time.Now(),
	}, nil
}
