package room

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Participant struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	IsHost         bool   `json:"isHost"`
	Muted          bool   `json:"muted"`
	Speaking       bool   `json:"speaking"`
	Sharing        bool   `json:"sharing"`
	CameraOn       bool   `json:"cameraOn"`
	SFUSessionID   string `json:"sfuSessionId,omitempty"`
	AudioTrackName string `json:"audioTrackName,omitempty"`
	CamTrackName   string `json:"camTrackName,omitempty"`
}

type ScreenShare struct {
	SharerID       string `json:"sharerId"`
	SharerName     string `json:"sharerName"`
	SFUSessionID   string `json:"sfuSessionId"`
	VideoTrackName string `json:"videoTrackName"`
	AudioTrackName string `json:"audioTrackName,omitempty"`
	Quality        string `json:"quality"`
}

type ChatMessage struct {
	ID         string `json:"id"`
	SenderID   string `json:"senderId"`
	SenderName string `json:"senderName"`
	Kind       string `json:"kind"` // "text" | "system"
	Text       string `json:"text"`
	ImageData  string `json:"imageData,omitempty"`
	Timestamp  int64  `json:"timestamp"`
}

type WaitingGuest struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type RoomInfo struct {
	ID              string         `json:"id"`
	HasPassword     bool           `json:"hasPassword"`
	Locked          bool           `json:"locked"`
	WaitingRoom     bool           `json:"waitingRoom"`
	MaxParticipants int            `json:"maxParticipants"`
	Participants    []Participant  `json:"participants"`
	ActiveShares    []ScreenShare  `json:"activeShares"`
	Waiting         []WaitingGuest `json:"waiting,omitempty"`
}

type client struct {
	id     string
	name   string
	isHost bool
	conn   *websocket.Conn
	send   chan []byte
}

type waitingEntry struct {
	id       string
	name     string
	cl       *client
	approved chan bool
}

type Room struct {
	id              string
	password        string
	locked          bool
	waitingRoom     bool
	maxParticipants int
	clients         map[string]*client
	members         map[string]Participant
	waiting         map[string]*waitingEntry
	activeShares    map[string]ScreenShare
	history         []ChatMessage
	notes           string
	mu              sync.Mutex
}

type Hub struct {
	mu        sync.Mutex
	rooms     map[string]*Room
	hostToken string
}

func NewHub(hostToken string) *Hub {
	return &Hub{
		rooms:     make(map[string]*Room),
		hostToken: hostToken,
	}
}

func (h *Hub) CreateRoom(password string, maxParticipants int, waitingRoom bool) RoomInfo {
	h.mu.Lock()
	defer h.mu.Unlock()

	id := shortID()
	r := &Room{
		id:              id,
		password:        password,
		waitingRoom:     waitingRoom,
		maxParticipants: maxParticipants,
		clients:         make(map[string]*client),
		members:         make(map[string]Participant),
		waiting:         make(map[string]*waitingEntry),
		activeShares:    make(map[string]ScreenShare),
		notes:           "# 会议纪要\n\n- ",
	}
	h.rooms[id] = r
	return r.snapshotLocked()
}

func (h *Hub) GetRoom(id string) (*Room, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[id]
	return r, ok
}

func (r *Room) snapshotLocked() RoomInfo {
	parts := make([]Participant, 0, len(r.members))
	for _, p := range r.members {
		parts = append(parts, p)
	}
	sort.Slice(parts, func(i, j int) bool {
		if parts[i].IsHost != parts[j].IsHost {
			return parts[i].IsHost
		}
		return parts[i].ID < parts[j].ID
	})

	shares := make([]ScreenShare, 0, len(r.activeShares))
	for _, s := range r.activeShares {
		shares = append(shares, s)
	}
	sort.Slice(shares, func(i, j int) bool {
		return shares[i].SharerID < shares[j].SharerID
	})

	waitingList := make([]WaitingGuest, 0, len(r.waiting))
	for _, w := range r.waiting {
		waitingList = append(waitingList, WaitingGuest{ID: w.id, Name: w.name})
	}
	sort.Slice(waitingList, func(i, j int) bool { return waitingList[i].ID < waitingList[j].ID })

	return RoomInfo{
		ID:              r.id,
		HasPassword:     r.password != "",
		Locked:          r.locked,
		WaitingRoom:     r.waitingRoom,
		MaxParticipants: r.maxParticipants,
		Participants:    parts,
		ActiveShares:    shares,
		Waiting:         waitingList,
	}
}

func (r *Room) broadcastLocked(eventType string, payload any) {
	env := map[string]any{
		"type":    eventType,
		"payload": payload,
	}
	b, _ := json.Marshal(env)
	for _, c := range r.clients {
		select {
		case c.send <- b:
		default:
		}
	}
}

func (h *Hub) HandleWS(w http.ResponseWriter, req *http.Request) {
	roomID := req.URL.Query().Get("room")
	name := req.URL.Query().Get("name")
	password := req.URL.Query().Get("password")
	hostTok := req.URL.Query().Get("hostToken")

	if name == "" {
		name = "Guest"
	}
	isHost := hostTok != "" && hostTok == h.hostToken

	h.mu.Lock()
	r, ok := h.rooms[roomID]
	if !ok {
		if !isHost {
			h.mu.Unlock()
			http.Error(w, "room not found", http.StatusNotFound)
			return
		}
		if roomID == "" {
			roomID = shortID()
		}
		r = &Room{
			id:              roomID,
			password:        password,
			maxParticipants: 0,
			clients:         make(map[string]*client),
			members:         make(map[string]Participant),
			waiting:         make(map[string]*waitingEntry),
			activeShares:    make(map[string]ScreenShare),
			notes:           "# 会议纪要\n\n- ",
		}
		h.rooms[roomID] = r
	}
	h.mu.Unlock()

	r.mu.Lock()
	if !isHost {
		if r.locked {
			r.mu.Unlock()
			http.Error(w, "room is locked", http.StatusForbidden)
			return
		}
		if r.maxParticipants > 0 && len(r.members) >= r.maxParticipants {
			r.mu.Unlock()
			http.Error(w, "room is full", http.StatusForbidden)
			return
		}
		if r.password != "" && r.password != password {
			r.mu.Unlock()
			http.Error(w, "invalid room password", http.StatusUnauthorized)
			return
		}
	}
	r.mu.Unlock()

	conn, err := upgrader.Upgrade(w, req, nil)
	if err != nil {
		return
	}

	cid := shortID()
	cl := &client{
		id:     cid,
		name:   name,
		isHost: isHost,
		conn:   conn,
		send:   make(chan []byte, 64),
	}

	go func() {
		defer conn.Close()
		for msg := range cl.send {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	// Waiting room check for non-host guests
	r.mu.Lock()
	needWait := !isHost && r.waitingRoom
	if needWait {
		entry := &waitingEntry{
			id:       cid,
			name:     name,
			cl:       cl,
			approved: make(chan bool, 1),
		}
		r.waiting[cid] = entry
		waitMsg, _ := json.Marshal(map[string]any{"type": "wait_approval", "payload": "正在等待房主批准入会..."})
		cl.send <- waitMsg
		r.broadcastLocked("room_state", r.snapshotLocked())
		r.mu.Unlock()

		// Read loop / wait for host decision or disconnect
		doneCh := make(chan struct{})
		go func() {
			for {
				if _, _, err := conn.ReadMessage(); err != nil {
					close(doneCh)
					return
				}
			}
		}()

		select {
		case ok := <-entry.approved:
			if !ok {
				rej, _ := json.Marshal(map[string]any{"type": "kicked", "payload": "房主已拒绝你的入会请求"})
				cl.send <- rej
				close(cl.send)
				return
			}
		case <-doneCh:
			r.mu.Lock()
			delete(r.waiting, cid)
			r.broadcastLocked("room_state", r.snapshotLocked())
			r.mu.Unlock()
			close(cl.send)
			return
		}
		r.mu.Lock()
	}

	r.clients[cid] = cl
	r.members[cid] = Participant{
		ID:     cid,
		Name:   name,
		IsHost: isHost,
		Muted:  false,
	}

	// Send welcome snapshot + chat history + shared notes to new client
	welcome, _ := json.Marshal(map[string]any{
		"type": "welcome",
		"payload": map[string]any{
			"selfId":  cid,
			"isHost":  isHost,
			"room":    r.snapshotLocked(),
			"history": r.history,
			"notes":   r.notes,
		},
	})
	cl.send <- welcome

	sysMsg := ChatMessage{
		ID:         shortID(),
		SenderID:   "system",
		SenderName: "System",
		Kind:       "system",
		Text:       name + " 加入了会议",
		Timestamp:  time.Now().UnixMilli(),
	}
	r.appendHistoryLocked(sysMsg)
	r.broadcastLocked("room_state", r.snapshotLocked())
	r.broadcastLocked("chat", sysMsg)
	r.mu.Unlock()

	defer func() {
		r.mu.Lock()
		p, existed := r.members[cid]
		delete(r.clients, cid)
		delete(r.members, cid)
		delete(r.activeShares, cid)
		if existed {
			leaveMsg := ChatMessage{
				ID:         shortID(),
				SenderID:   "system",
				SenderName: "System",
				Kind:       "system",
				Text:       p.Name + " 离开了会议",
				Timestamp:  time.Now().UnixMilli(),
			}
			r.appendHistoryLocked(leaveMsg)
			r.broadcastLocked("room_state", r.snapshotLocked())
			r.broadcastLocked("chat", leaveMsg)
		}
		r.mu.Unlock()
		close(cl.send)
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var msg struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}

		r.mu.Lock()
		switch msg.Type {
		case "chat":
			var p struct {
				Text      string `json:"text"`
				ImageData string `json:"imageData"`
			}
			if err := json.Unmarshal(msg.Payload, &p); err == nil && (p.Text != "" || p.ImageData != "") {
				if len(p.ImageData) > 2*1024*1024 {
					p.ImageData = ""
				}
				sender := r.members[cid]
				cm := ChatMessage{
					ID:         shortID(),
					SenderID:   cid,
					SenderName: sender.Name,
					Kind:       "text",
					Text:       p.Text,
					ImageData:  p.ImageData,
					Timestamp:  time.Now().UnixMilli(),
				}
				r.appendHistoryLocked(cm)
				r.broadcastLocked("chat", cm)
			}

		case "media_state":
			var p struct {
				Muted          *bool   `json:"muted"`
				Speaking       *bool   `json:"speaking"`
				CameraOn       *bool   `json:"cameraOn"`
				SFUSessionID   *string `json:"sfuSessionId"`
				AudioTrackName *string `json:"audioTrackName"`
				CamTrackName   *string `json:"camTrackName"`
			}
			if err := json.Unmarshal(msg.Payload, &p); err == nil {
				m := r.members[cid]
				if p.Muted != nil {
					m.Muted = *p.Muted
				}
				if p.Speaking != nil {
					m.Speaking = *p.Speaking
				}
				if p.CameraOn != nil {
					m.CameraOn = *p.CameraOn
				}
				if p.SFUSessionID != nil {
					m.SFUSessionID = *p.SFUSessionID
				}
				if p.AudioTrackName != nil {
					m.AudioTrackName = *p.AudioTrackName
				}
				if p.CamTrackName != nil {
					m.CamTrackName = *p.CamTrackName
				}
				r.members[cid] = m
				r.broadcastLocked("room_state", r.snapshotLocked())
			}

		case "share_start":
			var p struct {
				SFUSessionID   string `json:"sfuSessionId"`
				VideoTrackName string `json:"videoTrackName"`
				AudioTrackName string `json:"audioTrackName"`
				Quality        string `json:"quality"`
			}
			if err := json.Unmarshal(msg.Payload, &p); err == nil && p.VideoTrackName != "" {
				m := r.members[cid]
				m.Sharing = true
				r.members[cid] = m
				r.activeShares[cid] = ScreenShare{
					SharerID:       cid,
					SharerName:     m.Name,
					SFUSessionID:   p.SFUSessionID,
					VideoTrackName: p.VideoTrackName,
					AudioTrackName: p.AudioTrackName,
					Quality:        p.Quality,
				}
				r.broadcastLocked("room_state", r.snapshotLocked())
			}

		case "share_stop":
			delete(r.activeShares, cid)
			m := r.members[cid]
			m.Sharing = false
			r.members[cid] = m
			r.broadcastLocked("room_state", r.snapshotLocked())

		case "annotation":
			var p map[string]any
			if err := json.Unmarshal(msg.Payload, &p); err == nil {
				p["senderId"] = cid
				p["senderName"] = r.members[cid].Name
				r.broadcastLocked("annotation", p)
			}

		case "p2p_signal":
			var p map[string]any
			if err := json.Unmarshal(msg.Payload, &p); err == nil {
				p["fromId"] = cid
				p["fromName"] = r.members[cid].Name
				targetID, _ := p["targetId"].(string)
				env, _ := json.Marshal(map[string]any{"type": "p2p_signal", "payload": p})
				if targetID != "" {
					if tc, ok := r.clients[targetID]; ok {
						select {
						case tc.send <- env:
						default:
						}
					}
				} else {
					for id, tc := range r.clients {
						if id == cid {
							continue
						}
						select {
						case tc.send <- env:
						default:
						}
					}
				}
			}

		case "notes_update":
			var p struct {
				Notes string `json:"notes"`
			}
			if err := json.Unmarshal(msg.Payload, &p); err == nil {
				r.notes = p.Notes
				env, _ := json.Marshal(map[string]any{
					"type": "notes_update",
					"payload": map[string]any{
						"notes":    p.Notes,
						"editorId": cid,
					},
				})
				for id, tc := range r.clients {
					if id == cid {
						continue
					}
					select {
					case tc.send <- env:
					default:
					}
				}
			}

		case "host_action":
			if !isHost {
				break
			}
			var p struct {
				Action   string `json:"action"` // lock | unlock | kick | end | mute_all | approve | reject | waiting_on | waiting_off
				TargetID string `json:"targetId"`
			}
			if err := json.Unmarshal(msg.Payload, &p); err == nil {
				switch p.Action {
				case "lock":
					r.locked = true
					r.broadcastLocked("room_state", r.snapshotLocked())
				case "unlock":
					r.locked = false
					r.broadcastLocked("room_state", r.snapshotLocked())
				case "waiting_on":
					r.waitingRoom = true
					r.broadcastLocked("room_state", r.snapshotLocked())
				case "waiting_off":
					r.waitingRoom = false
					r.broadcastLocked("room_state", r.snapshotLocked())
				case "approve":
					if entry, ok := r.waiting[p.TargetID]; ok {
						delete(r.waiting, p.TargetID)
						select {
						case entry.approved <- true:
						default:
						}
					}
				case "reject":
					if entry, ok := r.waiting[p.TargetID]; ok {
						delete(r.waiting, p.TargetID)
						select {
						case entry.approved <- false:
						default:
						}
						r.broadcastLocked("room_state", r.snapshotLocked())
					}
				case "mute_all":
					env, _ := json.Marshal(map[string]any{"type": "force_mute", "payload": "房主已开启全员静音"})
					for id, tc := range r.clients {
						if id == cid {
							continue
						}
						select {
						case tc.send <- env:
						default:
						}
					}
				case "kick":
					if target, ok := r.clients[p.TargetID]; ok && p.TargetID != cid {
						kicked, _ := json.Marshal(map[string]any{"type": "kicked", "payload": "你已被房主移出会议"})
						target.send <- kicked
						_ = target.conn.Close()
					}
				case "end":
					ended, _ := json.Marshal(map[string]any{"type": "room_ended", "payload": "房主已结束会议"})
					for _, c := range r.clients {
						c.send <- ended
						_ = c.conn.Close()
					}
				}
			}
		}
		r.mu.Unlock()
	}
}

func (r *Room) appendHistoryLocked(msg ChatMessage) {
	r.history = append(r.history, msg)
	if len(r.history) > 100 {
		r.history = r.history[len(r.history)-100:]
	}
}

func shortID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
