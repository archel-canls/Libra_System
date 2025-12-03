package main

import (
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"sync"
	"text/template"
	"time"

	"github.com/go-sql-driver/mysql"
	_ "github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
)

var db *sql.DB
var mu sync.Mutex

var templates *template.Template

type User struct {
	ID             int
	Fullname       string
	Username       string
	Email          string
	Role           string
	ProfilePicture string `db:"profile_picture"` // mapping ke kolom db
	Alamat         string
	Phone          string
	Verified       bool
}

type BorrowRequest struct {
	BookID int `json:"book_id"`
	UserID int `json:"user_id"`
}

type Book struct {
	ID    int
	Title string
	Stock int
	Type  string
}
type EbookHistoryItem struct {
	ID           int    `json:"id"`
	BookID       int    `json:"bookId"`
	Title        string `json:"title"`
	CoverFile    string `json:"coverFile"`
	LastPage     int    `json:"lastPage"`
	DateLastRead string `json:"dateLastRead"`
}

type EbookProgressRequest struct {
	BookID int `json:"bookId"`
	Page   int `json:"page"`
}

type Bookmark struct {
	BookId int `json:"bookId"`
}

type Response struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// Struct untuk JSON Response Feedback
type SuggestionData struct {
	ID             int    `json:"id"`
	UserID         int    `json:"userId"`
	Fullname       string `json:"fullname"`       // Dari table users
	Username       string `json:"username"`       // Dari table users
	ProfilePicture string `json:"profilePicture"` // Dari table users
	Message        string `json:"message"`
	DateSent       string `json:"dateSent"`
	AdminReply     string `json:"adminReply"`
	Status         string `json:"status"`
}

// 1. Handler Halaman (Render HTML berdasarkan Role)
func feedbackPageHandler(w http.ResponseWriter, r *http.Request) {
	user := getCurrentUser(r) // Menggunakan fungsi helper yang sudah ada di main.go
	if user.ID == 0 {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	data := struct {
		User  User
		Title string
	}{
		User:  user,
		Title: "Kritik & Saran",
	}

	if user.Role == "admin" {
		renderTemplate(w, "feedback_admin.html", data)
	} else {
		renderTemplate(w, "feedback_member.html", data)
	}
}

// 2. API Handler: GET (Ambil Data) & POST (Kirim Saran)
func feedbackAPIHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	user := getCurrentUser(r)
	if user.ID == 0 {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(Response{Success: false, Message: "Unauthorized"})
		return
	}

	// --- GET: Ambil Daftar Saran ---
	if r.Method == http.MethodGet {
		var rows *sql.Rows
		var err error

		// Query berbeda untuk Admin dan Member
		query := `
			SELECT s.id, s.userId, u.fullname, u.username, u.profile_picture, 
			       s.message, s.dateSent, s.adminReply, s.status
			FROM suggestions s
			JOIN users u ON s.userId = u.id
		`

		if user.Role == "admin" {
			// Admin melihat semua saran, urut dari yang terbaru
			query += ` ORDER BY s.dateSent DESC`
			rows, err = db.Query(query)
		} else {
			// Member hanya melihat saran mereka sendiri
			query += ` WHERE s.userId = ? ORDER BY s.dateSent DESC`
			rows, err = db.Query(query, user.ID)
		}

		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Success: false, Message: err.Error()})
			return
		}
		defer rows.Close()

		var list []SuggestionData
		for rows.Next() {
			var s SuggestionData
			var reply sql.NullString // Handle null reply

			err := rows.Scan(&s.ID, &s.UserID, &s.Fullname, &s.Username, &s.ProfilePicture, &s.Message, &s.DateSent, &reply, &s.Status)
			if err != nil {
				continue
			}
			s.AdminReply = reply.String

			// Fix path gambar jika perlu (sama logicnya dgn handler lain)
			if s.ProfilePicture == "" {
				s.ProfilePicture = "/img/default_user.png"
			} else if !strings.HasPrefix(s.ProfilePicture, "data:") && !strings.HasPrefix(s.ProfilePicture, "uploads/") {
				s.ProfilePicture = "uploads/" + s.ProfilePicture
			}

			list = append(list, s)
		}
		json.NewEncoder(w).Encode(list)
		return
	}

	// --- POST: Kirim Saran Baru (Member Only) ---
	if r.Method == http.MethodPost {
		var input struct {
			Message string `json:"message"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		if input.Message == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Success: false, Message: "Pesan tidak boleh kosong"})
			return
		}

		_, err := db.Exec("INSERT INTO suggestions (userId, message) VALUES (?, ?)", user.ID, input.Message)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Success: false, Message: err.Error()})
			return
		}

		json.NewEncoder(w).Encode(Response{Success: true, Message: "Saran berhasil dikirim"})
		return
	}
}

// 3. API Handler: Reply Saran (Admin Only)
func feedbackReplyHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	user := getCurrentUser(r)
	if user.Role != "admin" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var input struct {
		ID    int    `json:"id"`
		Reply string `json:"reply"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	_, err := db.Exec("UPDATE suggestions SET adminReply=?, status='sudah dibalas' WHERE id=?", input.Reply, input.ID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(Response{Success: false, Message: err.Error()})
		return
	}

	json.NewEncoder(w).Encode(Response{Success: true, Message: "Balasan terkirim"})
}

// 4. API Handler: Hapus Saran (Admin Only)
func feedbackDeleteHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	user := getCurrentUser(r)
	if user.Role != "admin" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	idStr := r.URL.Query().Get("id")
	_, err := db.Exec("DELETE FROM suggestions WHERE id=?", idStr)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(Response{Success: false, Message: err.Error()})
		return
	}

	json.NewEncoder(w).Encode(Response{Success: true, Message: "Data dihapus"})
}

// session map sederhana
var sessions = map[string]User{}
var books = map[int]*Book{}

func initDB() {
	var err error
	fmt.Println("========================================")
	fmt.Println("DEBUGGING RAILWAY VARIABLES:")
	fmt.Println("DB_HOST:", os.Getenv("DB_HOST"))
	fmt.Println("DB_PORT:", os.Getenv("DB_PORT"))
	fmt.Println("DB_USER:", os.Getenv("DB_USER"))
	fmt.Println("========================================")
	// UBAH BARIS INI: Ambil dari Environment Variable, kalau kosong baru pakai localhost (untuk dev)
	dbUser := os.Getenv("DB_USER")
	dbPass := os.Getenv("DB_PASS")
	dbHost := os.Getenv("DB_HOST")
	dbPort := os.Getenv("DB_PORT")
	dbName := os.Getenv("DB_NAME")

	var dsn string
	if dbHost != "" {
		// Format Cloud (Railway)
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local&time_zone=%%27%%2B07%%3A00%%27",
			dbUser, dbPass, dbHost, dbPort, dbName)
	} else {
		// Fallback ke Localhost
		dsn = "root:@tcp(127.0.0.1:3306)/perpustakaan?parseTime=true&loc=Local&time_zone=%27%2B07%3A00%27"
	}

	db, err = sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal(err)
	}

	if err = db.Ping(); err != nil {
		log.Fatal("DB ping error:", err)
	}

	db.Exec("SET time_zone = '+07:00'")

	createUsers := `
	CREATE TABLE IF NOT EXISTS users (
		id INT AUTO_INCREMENT PRIMARY KEY,
		fullname VARCHAR(255),       -- Ubah jadi VARCHAR biar rapi (opsional)
		alamat TEXT,
		phone VARCHAR(20),           -- Ubah jadi VARCHAR (opsional)
		email VARCHAR(255) UNIQUE,   -- WAJIB DIUBAH DARI TEXT KE VARCHAR(255)
		username VARCHAR(255),       -- SEBAIKNYA DIUBAH JUGA
		password TEXT,
		profile_picture LONGTEXT,
		role VARCHAR(50),
		otp_code VARCHAR(10),
		otp_expires DATETIME,
		verified TINYINT(1) DEFAULT 0
	);`

	// auto create table books
	createBooks := `
	CREATE TABLE IF NOT EXISTS books (
		id INT AUTO_INCREMENT PRIMARY KEY,
		title VARCHAR(255) NOT NULL,
		author VARCHAR(255),
		isbn VARCHAR(50),
		publisher VARCHAR(255),
		year INT,
		genre TEXT,
		category VARCHAR(50),
		type ENUM('Buku Fisik','Ebook','Fisik & Ebook') DEFAULT 'Buku Fisik',
        location VARCHAR(255),
        stock INT DEFAULT 1,
		stockMax INT DEFAULT 1,
		fineAmount INT DEFAULT 0,
		description TEXT,
		coverFile VARCHAR(255),
		ebookFile VARCHAR(255),
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);
`

	// auto create table loans
	createTransactions := `
    CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        book_id INT NOT NULL,
        user_id INT NOT NULL,

        status ENUM(
        'DIAJUKAN',
        'DISETUJUI',
        'DIPINJAM',
        'DIKEMBALIKAN',
        'DITOLAK',
        'DIBATALKAN',
        'HILANG'
        ) DEFAULT 'DIAJUKAN',

        dateRequested DATETIME DEFAULT CURRENT_TIMESTAMP,
        dateApproved DATETIME NULL,
        dateBorrowed DATETIME NULL, -- Baru
        dateDue DATETIME NULL,
        dateReturned DATETIME NULL,
        dateRejected DATETIME NULL, -- Baru
        dateCanceled DATETIME NULL, -- Baru
        dateLost DATETIME NULL,     -- Baru

        fineTotal DECIMAL(10,2) DEFAULT 0.00,
        finePerDay DECIMAL(10,2) DEFAULT 0.00,
        firstFine DECIMAL(10,2) DEFAULT 0.00,

        activityLog JSON NULL,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );`

	createEbook_history := `
        CREATE TABLE IF NOT EXISTS ebook_history (
        id INT(10) AUTO_INCREMENT PRIMARY KEY,

        userId INT(10) NOT NULL,
        bookId INT(10) NOT NULL,

        dateLastRead DATETIME DEFAULT CURRENT_TIMESTAMP,
        lastPage INT(5) DEFAULT 0,

        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE,

        UNIQUE KEY unique_user_book (userId, bookId)
    );`

	createBookmarks := `
        CREATE TABLE IF NOT EXISTS bookmarks (
        id INT AUTO_INCREMENT PRIMARY KEY,

        -- Relasi ke user dan buku
        userId INT NOT NULL,
        bookId INT NOT NULL,

        -- Relasi ke tabel utama
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (bookId) REFERENCES books(id) ON DELETE CASCADE,

        -- Untuk memastikan 1 user hanya bisa bookmark 1 buku sekali
        UNIQUE KEY unique_user_book (userId, bookId)
    );`

	createSuggestions := `
        CREATE TABLE IF NOT EXISTS suggestions (
        id INT AUTO_INCREMENT PRIMARY KEY,

        -- Relasi ke user
        userId INT NOT NULL,

        -- Isi saran/kritik
        message TEXT NOT NULL,
        dateSent DATETIME DEFAULT CURRENT_TIMESTAMP,

        -- Balasan admin
        adminReply TEXT,

        -- Status balasan
        status ENUM('belum dibalas', 'sudah dibalas') DEFAULT 'belum dibalas',

        -- Relasi ke tabel users
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );`

	if _, err = db.Exec(createUsers); err != nil {
		log.Fatal("Error create users:", err)
	}
	if _, err = db.Exec(createBooks); err != nil {
		log.Fatal("Error create books:", err)
	}
	if _, err = db.Exec(createTransactions); err != nil {
		log.Fatal("Error create loans:", err)
	}
	if _, err = db.Exec(createEbook_history); err != nil {
		log.Fatal("Error create loans:", err)
	}
	if _, err = db.Exec(createBookmarks); err != nil {
		log.Fatal("Error create loans:", err)
	}
	if _, err = db.Exec(createSuggestions); err != nil {
		log.Fatal("Error create loans:", err)
	}

	fmt.Println("✅ Tables ensured (created if not exists).")
}

func main() {
	initDB()
	defer db.Close()

	ensureUploadFolders()

	var err error
	templates, err = template.ParseGlob("templates/*.html")
	if err != nil {
		log.Fatal("Gagal memuat template:", err)
	}
	http.HandleFunc("/", memberHandler)
	// fungsi pinja
	http.HandleFunc("/pinjambuku", handleBorrowBook)

	http.HandleFunc("/api/member/borrow", handleBorrowBook)
	http.HandleFunc("/api/books/random", randomBooksHandler)
	// static file
	http.Handle("/js/", http.StripPrefix("/js/", http.FileServer(http.Dir("./js"))))

	http.Handle("/css/", http.StripPrefix("/css/", http.FileServer(http.Dir("./css"))))

	http.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir("uploads"))))

	http.Handle("/img/", http.StripPrefix("/img/", http.FileServer(http.Dir("./img"))))

	// login
	http.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			renderTemplate(w, "login.html", nil)
		} else {
			loginHandler(w, r)
		}
	})

	// logout
	http.HandleFunc("/logout", logoutHandler)

	// reset pass
	http.HandleFunc("/profile/reset-password-admin", profileResetPasswordHandler)

	// register
	http.HandleFunc("/register", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			registerPage(w, r)
		} else {
			registerHandler(w, r)
		}
	})

	http.HandleFunc("/verify-otp", verifyOTPHandler)

	http.HandleFunc("/forgot_password", forgotPasswordPage)

	http.HandleFunc("/reset_password", resetPasswordPage)

	// tambah buku
	http.HandleFunc("/add-book", addBookHandler)

	http.HandleFunc("/books", listBooksHandler)

	// hapus buku
	http.HandleFunc("/books/", deleteBookByIDHandler)

	// uPDATE BUKU
	http.HandleFunc("/books/update", updateBookHandler)

	http.HandleFunc("/buka_buku_admin.html", bukaBukuAdminHandler)

	http.HandleFunc("/buka_buku_member.html", bukaBukuMemberHandler)

	// cek role
	http.HandleFunc("/admin", adminHandler)
	http.HandleFunc("/member", memberHandler)

	// --- Manajemen Anggota ---
	http.HandleFunc("/manajemen_anggota", manajemenAnggotaHandler)
	http.HandleFunc("/api/members", apiMembersHandler)
	http.HandleFunc("/api/members/", func(w http.ResponseWriter, r *http.Request) {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")

		if len(parts) == 4 && parts[3] == "role" && r.Method == http.MethodPut {
			// PUT /api/members/{id}/role
			id, err := strconv.Atoi(parts[2])
			if err != nil {
				http.Error(w, "Invalid user ID", http.StatusBadRequest)
				return
			}
			apiUpdateRoleHandler(w, r, id)
		} else if len(parts) == 3 && r.Method == http.MethodDelete {
			// DELETE /api/members/{id}
			id, err := strconv.Atoi(parts[2])
			if err != nil {
				http.Error(w, "Invalid user ID", http.StatusBadRequest)
				return
			}
			apiDeleteUserHandler(w, r, id)
		} else {
			http.Error(w, "Not found", http.StatusNotFound)
		}
	})

	// Pengaju7an pinjam
	http.HandleFunc("/pengajuan_pinjam", pengajuanPinjamHandler)

	// riwayat pinjam
	http.HandleFunc("/api/riwayat-pinjam", riwayatPinjamHandler)

	// Endpoint riwayat pinjam member
	http.HandleFunc("/api/member/riwayat-pinjam/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			// Tetap memanggil riwayatPinjamHandler yang lama
			riwayatPinjamHandler(w, r)
		case http.MethodPatch:
			// Panggil cancelBorrowHandler agar stok dikembalikan saat dibatalkan
			cancelBorrowHandler(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Ebook
	http.HandleFunc("/ebook", ebookHandler)
	http.HandleFunc("/baca_buku", bacaBukuPageHandler)

	// API Ebook Progress & History
	http.HandleFunc("/api/ebook/history", ebookHistoryAPIHandler)   // GET (List), DELETE (Hapus satu)
	http.HandleFunc("/api/ebook/progress", ebookProgressAPIHandler) // POST (Simpan), GET (Ambil last page)
	// bookmark
	http.HandleFunc("/bookmark", bookmarkHandler)
	http.HandleFunc("/bookmark/status", checkBookmarkHandler)
	http.HandleFunc("/bookmarkpage", bookmarkPageHandler)
	http.HandleFunc("/api/bookmarks", getBookmarksHandler)
	// --- FEEDBACK / KRITIK SARAN ---
	// Halaman Page
	http.HandleFunc("/feedback", feedbackPageHandler)

	// API Endpoints
	http.HandleFunc("/api/feedback", feedbackAPIHandler)           // GET (List) & POST (Submit)
	http.HandleFunc("/api/feedback/reply", feedbackReplyHandler)   // POST (Admin Reply)
	http.HandleFunc("/api/feedback/delete", feedbackDeleteHandler) // DELET

	// riwayat user dashboard admin
	http.HandleFunc("/api/admin/daftar-pinjam/", func(w http.ResponseWriter, r *http.Request) {
		cleanPath := strings.TrimSuffix(r.URL.Path, "/")

		switch r.Method {
		case http.MethodGet:
			if cleanPath == "/api/admin/daftar-pinjam" {
				adminListTransactionsHandler(w, r)
				return
			}
			http.Error(w, "Not Found", http.StatusNotFound)
			return

		case http.MethodPatch:
			// Ambil ID dari URL
			parts := strings.Split(r.URL.Path, "/")
			if len(parts) < 5 {
				http.Error(w, "ID tidak ditemukan", http.StatusBadRequest)
				return
			}
			idStr := parts[4]
			id, err := strconv.Atoi(idStr)
			if err != nil {
				http.Error(w, "ID invalid", http.StatusBadRequest)
				return
			}

			var payload struct {
				Status string `json:"status"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
				http.Error(w, "Invalid body", http.StatusBadRequest)
				return
			}

			// Validasi Status
			validStatuses := map[string]bool{
				"DISETUJUI":    true, // Baru
				"DIPINJAM":     true,
				"DITOLAK":      true,
				"DIKEMBALIKAN": true,
				"DIBATALKAN":   true, // Admin membatalkan setelah disetujui
				"HILANG":       true,
			}
			if !validStatuses[payload.Status] {
				http.Error(w, "Status tidak valid", http.StatusBadRequest)
				return
			}

			// --- LOGIKA TRANSISI STATUS ---
			// --- LOGIKA UPDATE STATUS & TANGGAL ---

			// 1. SETUJUI (Diajukan -> Disetujui)
			if payload.Status == "DISETUJUI" {
				// Isi dateApproved
				_, err = db.Exec("UPDATE transactions SET status=?, dateApproved=NOW() WHERE id=?", payload.Status, id)

				// 2. SERAHKAN (Disetujui -> Dipinjam)
			} else if payload.Status == "DIPINJAM" {
				now := time.Now()
				dateDue := now.AddDate(0, 0, 7).Format("2006-01-02 15:04:05")

				// Isi dateBorrowed (Waktu serah terima)
				_, err = db.Exec(`
                    UPDATE transactions
                    SET status=?, dateBorrowed=NOW(), dateDue=?, fineTotal=0, finePerDay=5000, firstFine=10000
                    WHERE id=?
                `, payload.Status, dateDue, id)

				// 3. DITOLAK
			} else if payload.Status == "DITOLAK" {
				tx, _ := db.Begin()
				var bookID int
				tx.QueryRow("SELECT book_id FROM transactions WHERE id=?", id).Scan(&bookID)

				// Isi dateRejected
				tx.Exec("UPDATE transactions SET status=?, dateRejected=NOW() WHERE id=?", payload.Status, id)
				tx.Exec("UPDATE books SET stockMax = stockMax + 1 WHERE id=?", bookID)
				err = tx.Commit()

				// 4. DIBATALKAN
			} else if payload.Status == "DIBATALKAN" {
				tx, _ := db.Begin()
				var bookID int
				tx.QueryRow("SELECT book_id FROM transactions WHERE id=?", id).Scan(&bookID)

				// Isi dateCanceled
				tx.Exec("UPDATE transactions SET status=?, dateCanceled=NOW() WHERE id=?", payload.Status, id)
				tx.Exec("UPDATE books SET stockMax = stockMax + 1 WHERE id=?", bookID)
				err = tx.Commit()

				// 5. DIKEMBALIKAN
			} else if payload.Status == "DIKEMBALIKAN" {
				// Isi dateReturned
				_, err = db.Exec("UPDATE transactions SET status=?, dateReturned=NOW() WHERE id=?", payload.Status, id)
				if err == nil {
					var bookID int
					db.QueryRow("SELECT book_id FROM transactions WHERE id=?", id).Scan(&bookID)
					db.Exec("UPDATE books SET stockMax = stockMax + 1 WHERE id=?", bookID)
				}

				// 6. HILANG
			} else if payload.Status == "HILANG" {
				var bookPrice int
				var currentFine float64

				err = db.QueryRow(`
                    SELECT COALESCE(b.fineAmount, 0), COALESCE(t.fineTotal, 0)
                    FROM transactions t
                    JOIN books b ON t.book_id = b.id
                    WHERE t.id = ?
                `, id).Scan(&bookPrice, &currentFine)

				if err == nil {
					finalTotal := currentFine + float64(bookPrice)
					// Isi dateLost
					_, err = db.Exec("UPDATE transactions SET status=?, fineTotal=?, dateLost=NOW() WHERE id=?", payload.Status, finalTotal, id)
				}
			}

			if err != nil {
				log.Println("Error update status:", err)
				http.Error(w, "Gagal update status database", http.StatusInternalServerError)
				return
			}

			// Trigger update denda sekali lagi agar data fresh
			updateFineTotals()

			w.WriteHeader(http.StatusOK)
			w.Write([]byte("Status berhasil diubah"))

		default:
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		}
	})

	// Manajemen Pinjam
	http.HandleFunc("/manajemen_pinjam", manajemenPengajuanHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // Default untuk lokal
	}
	fmt.Println("🚀 Database siap dipakai.")
	fmt.Println("🚀 Server jalan di port " + port)
	log.Fatal(http.ListenAndServe(":"+port, nil)) // <--- HARUS PAKAI VARIABEL port
}

func renderTemplate(w http.ResponseWriter, name string, data interface{}) {
	tmpl, err := template.ParseGlob("templates/*.html")
	if err != nil {
		http.Error(w, "Gagal memuat template", http.StatusInternalServerError)
		return
	}
	err = tmpl.ExecuteTemplate(w, name, data)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func ensureUploadFolders() {
	paths := []string{
		"uploads",
		"uploads/covers",
		"uploads/ebooks",
		"uploads/users",
	}

	for _, path := range paths {
		if _, err := os.Stat(path); os.IsNotExist(err) {
			err := os.MkdirAll(path, os.ModePerm)
			if err != nil {
				log.Fatalf("Gagal membuat folder %s: %v", path, err)
			}
			fmt.Println("✅ Folder dibuat:", path)
		}
	}

	// Salin default_user.png jika belum ada
	defaultFile := "uploads/users/default_user.png"
	if _, err := os.Stat(defaultFile); os.IsNotExist(err) {
		src, err := os.Open("img/default_user.png")
		if err != nil {
			log.Println("⚠ Warning: img/default_user.png tidak ditemukan")
			return
		}
		defer src.Close()

		dst, err := os.Create(defaultFile)
		if err != nil {
			log.Println("⚠ Gagal membuat default_user.png di uploads/users/")
			return
		}
		defer dst.Close()

		if _, err := io.Copy(dst, src); err != nil {
			log.Println("⚠ Gagal menyalin default_user.png:", err)
		} else {
			fmt.Println("✅ default_user.png berhasil disalin ke uploads/users/")
		}
	}
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	username := r.FormValue("username")
	password := r.FormValue("password")

	var id int
	var fullname, email, profilePicture, passwordHash, role string
	var verified bool // cek verified

	err := db.QueryRow(`
		SELECT id, fullname, email, profile_picture, password, role, verified
		FROM users
		WHERE username = ?`, username).
		Scan(&id, &fullname, &email, &profilePicture, &passwordHash, &role, &verified)

	if err == sql.ErrNoRows {
		http.SetCookie(w, &http.Cookie{
			Name:   "login_error",
			Value:  "Username atau password tidak sesuai",
			Path:   "/login",
			MaxAge: 60,
		})
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	} else if err != nil {
		http.SetCookie(w, &http.Cookie{
			Name:   "login_error",
			Value:  "Database error",
			Path:   "/login",
			MaxAge: 60,
		})
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// cek password
	err = bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password))
	if err != nil {
		http.SetCookie(w, &http.Cookie{
			Name:   "login_error",
			Value:  "Username atau password tidak sesuai",
			Path:   "/login",
			MaxAge: 60,
		})
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// ❌ cek verifikasi OTP
	if !verified {
		http.SetCookie(w, &http.Cookie{
			Name:   "login_error",
			Value:  "Akun belum diverifikasi",
			Path:   "/login",
			MaxAge: 60,
		})
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// login sukses
	user := User{
		ID:             id,
		Username:       username,
		Fullname:       fullname,
		Email:          email,
		Role:           role,
		ProfilePicture: profilePicture,
	}

	sessionID := strconv.FormatInt(time.Now().UnixNano(), 36)
	sessions[sessionID] = user

	http.SetCookie(w, &http.Cookie{
		Name:  "session_id",
		Value: sessionID,
		Path:  "/",
	})

	if role == "admin" {
		http.Redirect(w, r, "/admin", http.StatusSeeOther)
	} else {
		http.Redirect(w, r, "/member", http.StatusSeeOther)
	}
}

// logout
func logoutHandler(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err == nil {
		// hapus session
		delete(sessions, cookie.Value)

		// hapus cookie
		http.SetCookie(w, &http.Cookie{
			Name:   "session_id",
			Value:  "",
			Path:   "/",
			MaxAge: -1,
		})
	}

	http.Redirect(w, r, "/member", http.StatusSeeOther)
}

// --- admin handler ---
func adminHandler(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	user, ok := sessions[cookie.Value]
	if !ok || user.Role != "admin" {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	if user.ProfilePicture == "" {
		user.ProfilePicture = "uploads/users/default_user.png"
	} else if !strings.HasPrefix(user.ProfilePicture, "data:") && !strings.HasPrefix(user.ProfilePicture, "uploads/") {
		user.ProfilePicture = "uploads/" + user.ProfilePicture
	}

	data := struct {
		User User
	}{User: user}

	page := r.URL.Query().Get("page")
	templateName := "dashboard_admin.html"
	if page == "buka_buku" {
		templateName = "buka_buku_admin.html"
	}

	renderTemplate(w, templateName, data)
}

// --- member handler ---
func memberHandler(w http.ResponseWriter, r *http.Request) {
	// Default User sebagai "Pengunjung" (Guest)
	user := User{
		ID:             0, // ID 0 menandakan belum login
		Fullname:       "Pengunjung",
		Username:       "Guest",
		Email:          "-",
		Role:           "guest",
		ProfilePicture: "uploads/users/default_user.png", // Default foto
	}

	// Cek Cookie Session
	cookie, err := r.Cookie("session_id")
	if err == nil {
		// Jika ada cookie, cek apakah valid di map sessions
		if u, ok := sessions[cookie.Value]; ok {
			// Pastikan yang login bukan admin (opsional, tergantung logic app Anda)
			if u.Role == "member" {
				user = u
			}
		}
	}

	// Logic Path Gambar (Sama seperti sebelumnya)
	if user.ProfilePicture == "" {
		user.ProfilePicture = "uploads/users/default_user.png"
	} else if !strings.HasPrefix(user.ProfilePicture, "data:") && !strings.HasPrefix(user.ProfilePicture, "uploads/") {
		user.ProfilePicture = "uploads/" + user.ProfilePicture
	}

	// Kirim data ke template
	data := struct {
		User User
	}{
		User: user,
	}

	renderTemplate(w, "dashboard_member.html", data)
}

// register
func registerPage(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles("templates/register.html")
	if err != nil {
		http.Error(w, "Template error", http.StatusInternalServerError)
		return
	}
	tmpl.Execute(w, nil)
}

// Handler register
func registerHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("Menerima request registrasi...")

	if r.Method != http.MethodPost {
		templates.ExecuteTemplate(w, "register.html", nil)
		return
	}

	err := r.ParseForm()
	if err != nil {
		http.Error(w, "Gagal membaca form", http.StatusBadRequest)
		return
	}

	// Tangkap semua data form
	nama := r.FormValue("nama")
	alamat := r.FormValue("alamat")
	nohp := r.FormValue("nohp")
	email := strings.TrimSpace(r.FormValue("email"))
	profilePictureData := r.FormValue("profile_picture_data") // base64 string

	username := r.FormValue("username")
	password := r.FormValue("password")
	confirmPassword := r.FormValue("confirm_password")

	//

	// Validasi password
	if password != confirmPassword {
		http.Error(w, "Password dan konfirmasi tidak sama", http.StatusBadRequest)
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Gagal mengolah password", http.StatusInternalServerError)
		return
	}

	// Generate OTP dan waktu expired
	otp := generateOTP()
	expires := time.Now().Add(5 * time.Minute)

	// Cek apakah user sudah ada
	var userID int
	var verified bool
	err = db.QueryRow("SELECT id, verified FROM users WHERE email = ?", email).Scan(&userID, &verified)

	if err != nil && err != sql.ErrNoRows {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err == sql.ErrNoRows {
		// INSERT USER BARU
		res, err := db.Exec(`
			INSERT INTO users(fullname, alamat, phone, email, username, password, role, otp_code, otp_expires, verified, profile_picture)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			nama, alamat, nohp, email, username, string(hashedPassword),
			"member", otp, expires, false, profilePictureData,
		)
		if err != nil {
			log.Println("Gagal insert user:", err)

			// Tangani duplicate username
			if mysqlErr, ok := err.(*mysql.MySQLError); ok && mysqlErr.Number == 1062 {
				w.Header().Set("Content-Type", "text/html")
				fmt.Fprintf(w, `<script>alert("Username sudah digunakan, silakan pilih username lain."); window.history.back();</script>`)
				return
			}

			// Error lain
			w.Header().Set("Content-Type", "text/html")
			fmt.Fprintf(w, `<script>alert("Gagal mendaftar: %s"); window.history.back();</script>`, err.Error())
			return
		}

		lastID, _ := res.LastInsertId()
		log.Println("User berhasil disimpan dengan ID:", lastID)
	} else {
		// USER SUDAH ADA, TAPI BELUM VERIFIED
		if verified {
			http.Error(w, "Email sudah terdaftar dan sudah diverifikasi", http.StatusBadRequest)
			return
		}
		_, err := db.Exec(`
			UPDATE users
			SET fullname=?, alamat=?, phone=?, username=?, password=?, otp_code=?, otp_expires=?, profile_picture=?
			WHERE id=?`,
			nama, alamat, nohp, username, string(hashedPassword), otp, expires, profilePictureData, userID,
		)
		if err != nil {
			log.Println("Gagal update user:", err)
			http.Error(w, "Gagal memperbarui data user", http.StatusInternalServerError)
			return
		}
		log.Println("User berhasil diperbarui dengan ID:", userID)
	}

	// Kirim OTP ke email
	log.Printf("DEBUG - Kirim OTP ke email: '%s'\n", email)

	err = sendEmailOTP(email, otp)
	if err != nil {
		http.Error(w, "Gagal mengirim email OTP: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Tampilkan halaman verifikasi OTP
	err = templates.ExecuteTemplate(w, "otp.html", map[string]string{"Email": email})
	if err != nil {
		http.Error(w, "Gagal menampilkan halaman OTP", http.StatusInternalServerError)
		return
	}
}

func generateOTP() string {
	rand.Seed(time.Now().UnixNano())
	return fmt.Sprintf("%06d", rand.Intn(1000000))
}

func sendEmailOTP(to, otp string) error {
	from := "13minting0@gmail.com"
	password := "jxseuwiqqinqnwgm"

	smtpHost := "smtp.gmail.com"
	smtpPort := "465"

	auth := smtp.PlainAuth("", from, password, smtpHost)

	msg := "From: " + from + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: Kode OTP Verifikasi\r\n\r\n" +
		"Kode OTP Anda adalah: " + otp

	// TLS config
	tlsconfig := &tls.Config{
		InsecureSkipVerify: true,
		ServerName:         smtpHost,
	}

	conn, err := tls.Dial("tcp", smtpHost+":"+smtpPort, tlsconfig)
	if err != nil {
		return fmt.Errorf("Dial TLS error: %w", err)
	}

	c, err := smtp.NewClient(conn, smtpHost)
	if err != nil {
		return fmt.Errorf("NewClient error: %w", err)
	}

	if err = c.Auth(auth); err != nil {
		return fmt.Errorf("Auth error: %w", err)
	}

	if err = c.Mail(from); err != nil {
		return fmt.Errorf("Mail error: %w", err)
	}

	if err = c.Rcpt(to); err != nil {
		return fmt.Errorf("Rcpt error: %w", err)
	}

	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("Data error: %w", err)
	}

	_, err = w.Write([]byte(msg))
	if err != nil {
		return fmt.Errorf("Write error: %w", err)
	}

	err = w.Close()
	if err != nil {
		return fmt.Errorf("Close error: %w", err)
	}

	c.Quit()

	return nil
}

// Handler verifikasi OTP
func verifyOTPHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		r.ParseForm()

		// Bersihkan input email
		email := strings.TrimSpace(r.FormValue("email"))
		otpInput := r.FormValue("otp")

		log.Printf("Verifikasi OTP untuk email: '%s'", email)

		row := db.QueryRow("SELECT otp_code, otp_expires FROM users WHERE email = ? AND verified = false", email)

		var otpCode string
		var otpExpires time.Time
		err := row.Scan(&otpCode, &otpExpires)
		if err != nil {
			log.Println("Gagal scan OTP:", err)
			http.Error(w, "Email tidak ditemukan", http.StatusBadRequest)
			return
		}

		if time.Now().After(otpExpires) {
			http.Error(w, "Kode OTP sudah kedaluwarsa", http.StatusBadRequest)
			return
		}

		if otpInput != otpCode {
			http.Error(w, "Kode OTP salah", http.StatusBadRequest)
			return
		}

		_, err = db.Exec("UPDATE users SET verified = ? WHERE email = ?", true, email)
		if err != nil {
			http.Error(w, "Gagal update status verifikasi", http.StatusInternalServerError)
			return
		}

		templates.ExecuteTemplate(w, "success.html", nil)
		return
	}

	http.Redirect(w, r, "/register", http.StatusSeeOther)
}

// --- FORGOT PASSWORD ---

// 1️⃣ Halaman lupa password
func forgotPasswordPage(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		tmpl, _ := template.ParseFiles("templates/forgot_password.html")
		tmpl.Execute(w, nil)
		return
	}

	if r.Method == http.MethodPost {
		email := strings.TrimSpace(r.FormValue("email"))

		// Cek apakah email ada di database
		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM users WHERE email=?)", email).Scan(&exists)
		if err != nil {
			http.Error(w, "Kesalahan server", http.StatusInternalServerError)
			return
		}
		if !exists {
			http.Error(w, "Email tidak ditemukan", http.StatusBadRequest)
			return
		}

		// Generate OTP dan kirim ke email
		otp := generateOTP()
		expires := time.Now().Add(5 * time.Minute)

		_, err = db.Exec("UPDATE users SET otp_code=?, otp_expires=? WHERE email=?", otp, expires, email)
		if err != nil {
			http.Error(w, "Gagal menyimpan OTP", http.StatusInternalServerError)
			return
		}

		err = sendEmailOTP(email, otp)
		if err != nil {
			http.Error(w, "Gagal mengirim OTP: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Arahkan ke halaman reset password
		http.Redirect(w, r, "/reset_password?email="+email, http.StatusSeeOther)
	}
}

// 2️⃣ Halaman reset password
func resetPasswordPage(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		email := r.URL.Query().Get("email")
		tmpl, _ := template.ParseFiles("templates/reset_password.html")
		tmpl.Execute(w, map[string]string{"Email": email})
		return
	}

	if r.Method == http.MethodPost {
		email := strings.TrimSpace(r.FormValue("email"))
		otp := r.FormValue("otp")
		newPassword := r.FormValue("new_password")

		var otpCode string
		var otpExpires time.Time

		err := db.QueryRow("SELECT otp_code, otp_expires FROM users WHERE email=?", email).Scan(&otpCode, &otpExpires)
		if err != nil {
			http.Error(w, "Email tidak ditemukan", http.StatusBadRequest)
			return
		}

		// Validasi OTP
		if time.Now().After(otpExpires) {
			http.Error(w, "Kode OTP sudah kedaluwarsa", http.StatusBadRequest)
			return
		}

		if otp != otpCode {
			http.Error(w, "Kode OTP salah", http.StatusBadRequest)
			return
		}

		// Hash password baru
		hashed, _ := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
		_, err = db.Exec("UPDATE users SET password=?, otp_code=NULL, otp_expires=NULL WHERE email=?", string(hashed), email)
		if err != nil {
			http.Error(w, "Gagal memperbarui password", http.StatusInternalServerError)
			return
		}

		tmpl, _ := template.ParseFiles("templates/reset_success.html")
		tmpl.Execute(w, nil)
	}
}

// Handler tambah buku
func addBookHandler(w http.ResponseWriter, r *http.Request) {
	type JSONResponse struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}

	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		log.Println("Method not allowed:", r.Method)
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(JSONResponse{
			Success: false,
			Message: "Method not allowed",
		})
		return
	}

	// Parse form dengan batas maksimal 20MB
	err := r.ParseMultipartForm(20 << 20)
	if err != nil {
		log.Println("ParseMultipartForm error:", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(JSONResponse{
			Success: false,
			Message: "Gagal membaca form: " + err.Error(),
		})
		return
	}

	title := r.FormValue("title")
	author := r.FormValue("author")
	yearStr := r.FormValue("year")
	genre := r.FormValue("genre")
	category := r.FormValue("category")
	bookType := r.FormValue("type")
	location := r.FormValue("location")
	stockMaxStr := r.FormValue("stockMax")
	fineAmountStr := r.FormValue("fineAmount")
	description := r.FormValue("description")

	log.Println("Form values:", title, author, yearStr, genre, category, bookType, stockMaxStr, fineAmountStr)

	year, err := strconv.Atoi(yearStr)
	if err != nil {
		log.Println("Invalid year:", yearStr)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(JSONResponse{false, "Tahun tidak valid"})
		return
	}
	stockMax, err := strconv.Atoi(stockMaxStr)
	if err != nil {
		log.Println("Invalid stockMax:", stockMaxStr)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(JSONResponse{false, "Stock Max tidak valid"})
		return
	}
	fineAmount, err := strconv.Atoi(fineAmountStr)
	if err != nil {
		log.Println("Invalid fineAmount:", fineAmountStr)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(JSONResponse{false, "Fine Amount tidak valid"})
		return
	}

	// Upload cover
	var coverPath string
	coverFile, coverHeader, err := r.FormFile("cover")
	if err == nil {
		defer coverFile.Close()
		coverPath = "uploads/covers/" + coverHeader.Filename
		log.Println("Uploading cover to:", coverPath)
		dst, err := os.Create(coverPath)
		if err != nil {
			log.Println("Create cover file error:", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(JSONResponse{false, "Gagal menyimpan cover: " + err.Error()})
			return
		}
		defer dst.Close()
		_, err = io.Copy(dst, coverFile)
		if err != nil {
			log.Println("Copy cover file error:", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(JSONResponse{false, "Gagal menyalin cover: " + err.Error()})
			return
		}
	} else {
		log.Println("No cover uploaded, using default cover")
		coverPath = "uploads/covers/default_cover.jpg"
	}

	// Upload ebook
	var ebookPath string
	ebookFile, ebookHeader, err := r.FormFile("ebook")
	if err == nil {
		defer ebookFile.Close()
		ebookPath = "uploads/ebooks/" + ebookHeader.Filename
		log.Println("Uploading ebook to:", ebookPath)
		dst, err := os.Create(ebookPath)
		if err != nil {
			log.Println("Create ebook file error:", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(JSONResponse{false, "Gagal menyimpan ebook: " + err.Error()})
			return
		}
		defer dst.Close()
		_, err = io.Copy(dst, ebookFile)
		if err != nil {
			log.Println("Copy ebook file error:", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(JSONResponse{false, "Gagal menyalin ebook: " + err.Error()})
			return
		}
	} else {
		log.Println("No ebook uploaded or error:", err)
	}

	// Insert ke database
	query := `INSERT INTO books 
        (title, author, year, genre, category, ` + "`type`" + `, location, stockMax, fineAmount, description, coverFile, ebookFile)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err = db.Exec(query, title, author, year, genre, category, bookType, location, stockMax, fineAmount, description, coverPath, ebookPath)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(JSONResponse{false, "Gagal menambahkan buku: " + err.Error()})
		return
	}

	log.Println("Book successfully added:", title)
	json.NewEncoder(w).Encode(JSONResponse{true, "Buku berhasil ditambahkan!"})
}
func randomBooksHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Query mengambil 5 buku acak dari MySQL
	// Pastikan kolom description ada, jika di DB namanya 'description' kita ambil sebagai synopsis
	rows, err := db.Query(`
		SELECT id, title, author, description, coverFile 
		FROM books 
		ORDER BY RAND() 
		LIMIT 5
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var booksList []map[string]interface{}
	for rows.Next() {
		var id int
		var title, author, description, coverFile sql.NullString

		if err := rows.Scan(&id, &title, &author, &description, &coverFile); err != nil {
			continue
		}

		booksList = append(booksList, map[string]interface{}{
			"id":       id,
			"title":    title.String,
			"author":   author.String,
			"synopsis": description.String, // Mapping description DB ke key synopsis buat JS
			"cover":    coverFile.String,
		})
	}

	json.NewEncoder(w).Encode(booksList)
}

// Handler untuk daftar buku dengan optional search query
func listBooksHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	search := r.URL.Query().Get("search")
	bookType := r.URL.Query().Get("type")
	category := r.URL.Query().Get("category")

	// UBAH: Ambil genre sebagai array/slice string
	// URL contoh: /books?genre=Horor&genre=Komedi
	genres := r.URL.Query()["genre"]

	var rows *sql.Rows
	var err error

	baseQuery := `
        SELECT id, title, author, year, genre, category, type, stockMax, fineAmount, description, coverFile, location, ebookFile
        FROM books
    `
	var conditions []string
	var args []interface{}

	// 1. Filter Search (Judul/Penulis)
	if search != "" {
		conditions = append(conditions, `(LOWER(title) LIKE LOWER(?) OR LOWER(author) LIKE LOWER(?))`)
		likeSearch := "%" + search + "%"
		args = append(args, likeSearch, likeSearch)
	}

	// 2. Filter Tipe
	if bookType != "" {
		if bookType == "Fisik & Ebook" {
			// Jika user memilih "Fisik & Ebook", HANYA tampilkan tipe tersebut
			// (Tidak menampilkan yang cuma fisik maupun cuma ebook)
			conditions = append(conditions, "type = ?")
			args = append(args, "Fisik & Ebook")

		} else if bookType == "Buku Fisik" {
			// Jika user memilih "Fisik", tampilkan "Buku Fisik" DAN "Fisik & Ebook"
			conditions = append(conditions, "(type = ? OR type = 'Fisik & Ebook')")
			args = append(args, "Buku Fisik")

		} else if bookType == "Ebook" {
			// Jika user memilih "Ebook", tampilkan "Ebook" DAN "Fisik & Ebook"
			conditions = append(conditions, "(type = ? OR type = 'Fisik & Ebook')")
			args = append(args, "Ebook")

		} else {
			// Fallback untuk value lain jika ada
			conditions = append(conditions, "type = ?")
			args = append(args, bookType)
		}
	}

	// 3. Filter Kategori
	if category != "" {
		conditions = append(conditions, "category = ?")
		args = append(args, category)
	}

	// 4. Filter Genre (MULTI TAG - AND LOGIC)
	// Jika user memilih [Komedi, Horor], maka buku harus mengandung Komedi DAN Horor
	if len(genres) > 0 {
		for _, g := range genres {
			if g != "" {
				conditions = append(conditions, "LOWER(genre) LIKE LOWER(?)")
				args = append(args, "%"+g+"%")
			}
		}
	}

	if len(conditions) > 0 {
		baseQuery += " WHERE " + strings.Join(conditions, " AND ")
	}

	rows, err = db.Query(baseQuery, args...)
	if err != nil {
		log.Println("Query error:", err)
		http.Error(w, "Gagal mengambil data buku", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var booksList []map[string]interface{}
	for rows.Next() {
		var id int
		var year, stockMax, fineAmount sql.NullInt64
		// Tambahkan var ebookFileDB sql.NullString di sini
		var title, author, genreDB, categoryDB, tipe, description, coverFile, location, ebookFileDB sql.NullString

		// Update Scan: Tambahkan &ebookFileDB di paling akhir
		if err := rows.Scan(&id, &title, &author, &year, &genreDB, &categoryDB, &tipe, &stockMax, &fineAmount, &description, &coverFile, &location, &ebookFileDB); err != nil {
			log.Println("Scan error:", err)
			continue
		}

		booksList = append(booksList, map[string]interface{}{
			"id":          id,
			"title":       title.String,
			"author":      author.String,
			"year":        int(year.Int64),
			"genre":       genreDB.String,
			"category":    categoryDB.String,
			"type":        tipe.String,
			"stock":       int(stockMax.Int64),
			"fineAmount":  int(fineAmount.Int64),
			"description": description.String,
			"coverFile":   coverFile.String,
			"location":    location.String,
			"ebookFile":   ebookFileDB.String, // <-- Masukkan ke map response JSON
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(booksList)
}

func bukaBukuAdminHandler(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	user, ok := sessions[cookie.Value]
	if !ok || user.Role != "admin" {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	if user.ProfilePicture == "" {
		user.ProfilePicture = "uploads/users/default_user.png"
	}

	id := r.URL.Query().Get("id")

	data := struct {
		User   User
		BookID string
	}{
		User:   user,
		BookID: id,
	}

	renderTemplate(w, "buka_buku_admin.html", data)
}

func deleteBookByIDHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Ambil ID dari URL: /books/1
	id := strings.TrimPrefix(r.URL.Path, "/books/")
	if id == "" {
		http.Error(w, "Missing book ID", http.StatusBadRequest)
		return
	}

	result, err := db.Exec("DELETE FROM books WHERE id = ?", id)
	if err != nil {
		http.Error(w, "Gagal menghapus buku dari database", http.StatusInternalServerError)
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		http.Error(w, "Buku tidak ditemukan", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "deleted"})
}

// Handle update book

func updateBookHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 1. Naikkan limit upload (misal 20MB) agar PDF bisa masuk
	err := r.ParseMultipartForm(20 << 20)
	if err != nil {
		http.Error(w, "Gagal membaca form atau file terlalu besar", http.StatusBadRequest)
		return
	}

	// Ambil data text form
	id := r.FormValue("id")
	title := r.FormValue("title")
	author := r.FormValue("author")
	year := r.FormValue("year")
	genre := r.FormValue("genre")
	category := r.FormValue("category")
	bookType := r.FormValue("type")
	description := r.FormValue("description")
	location := r.FormValue("location")

	// Konversi angka (Stock & FineAmount)
	stockStr := r.FormValue("stock")
	stock, err := strconv.Atoi(stockStr)
	if err != nil {
		stock = 0
	}

	fineAmountStr := r.FormValue("fineAmount")
	fineAmount, err := strconv.ParseFloat(fineAmountStr, 64)
	if err != nil {
		fineAmount = 0
	}

	// --- [LOGIKA COVER - SUDAH ADA] ---
	coverFile, headerCover, err := r.FormFile("cover")
	coverPath := ""
	if err == nil {
		defer coverFile.Close()
		coverPath = "uploads/covers/" + headerCover.Filename
		// Pastikan folder ada
		os.MkdirAll("uploads/covers", os.ModePerm)
		f, err := os.Create(coverPath)
		if err == nil {
			defer f.Close()
			io.Copy(f, coverFile)
		}
	}

	// --- [LOGIKA EBOOK - INI YANG ANDA KURANG] ---
	ebookFile, headerEbook, err := r.FormFile("ebook")
	ebookPath := ""
	if err == nil { // Jika ada file ebook yang diupload
		defer ebookFile.Close()
		ebookPath = "uploads/ebooks/" + headerEbook.Filename

		// Buat folder jika belum ada
		os.MkdirAll("uploads/ebooks", os.ModePerm)

		f, err := os.Create(ebookPath)
		if err == nil {
			defer f.Close()
			io.Copy(f, ebookFile)
		} else {
			log.Println("Gagal menyimpan file ebook:", err)
		}
	}

	// --- UPDATE DATABASE QUERY ---
	// Query dasar
	query := `
        UPDATE books
        SET title=?, author=?, year=?, genre=?, category=?, type=?, description=?, location=?, stockMax=?, fineAmount=?`

	args := []interface{}{title, author, year, genre, category, bookType, description, location, stock, fineAmount}

	// Jika coverPath tidak kosong (ada upload baru), update kolom coverFile
	if coverPath != "" {
		query += `, coverFile=?`
		args = append(args, coverPath)
	}

	// [PENTING] Jika ebookPath tidak kosong (ada upload baru), update kolom ebookFile
	if ebookPath != "" {
		query += `, ebookFile=?`
		args = append(args, ebookPath)
	}

	query += ` WHERE id=?`
	args = append(args, id)

	// Eksekusi Query
	_, err = db.Exec(query, args...)

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Database error: " + err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Buku berhasil diperbarui",
	})
}

// Handler untuk buka_buku_member.html
func bukaBukuMemberHandler(w http.ResponseWriter, r *http.Request) {
	// 1. Default User sebagai "Guest"
	user := User{
		ID:             0,
		Fullname:       "Pengunjung",
		Username:       "Guest",
		Role:           "guest",
		ProfilePicture: "uploads/users/default_user.png",
	}

	// 2. Cek Cookie Session (Jika ada, timpa data Guest dengan data Member)
	cookie, err := r.Cookie("session_id")
	if err == nil {
		if u, ok := sessions[cookie.Value]; ok {
			// Opsional: Pastikan role member/admin sesuai kebutuhan
			user = u
		}
	}

	// Pastikan path gambar valid
	if user.ProfilePicture == "" {
		user.ProfilePicture = "uploads/users/default_user.png"
	} else if !strings.HasPrefix(user.ProfilePicture, "data:") && !strings.HasPrefix(user.ProfilePicture, "uploads/") {
		user.ProfilePicture = "uploads/" + user.ProfilePicture
	}

	// 3. Ambil ID Buku
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "ID buku tidak ditemukan", http.StatusBadRequest)
		return
	}

	data := struct {
		User   User
		BookID string
	}{
		User:   user,
		BookID: id,
	}

	renderTemplate(w, "buka_buku_member.html", data)
}

// 1. Handler Halaman Baca Buku (PDF Reader)
func bacaBukuPageHandler(w http.ResponseWriter, r *http.Request) {
	user := getCurrentUser(r)
	if user.ID == 0 {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	bookID := r.URL.Query().Get("id")
	if bookID == "" {
		http.Error(w, "Book ID required", http.StatusBadRequest)
		return
	}

	// Ambil detail buku (terutama path ebookFile)
	var book Book
	var ebookFile sql.NullString
	err := db.QueryRow("SELECT id, title, ebookFile FROM books WHERE id = ?", bookID).Scan(&book.ID, &book.Title, &ebookFile)
	if err != nil {
		http.Error(w, "Buku tidak ditemukan", http.StatusNotFound)
		return
	}

	data := struct {
		User      User
		BookID    int
		Title     string
		EbookFile string
	}{
		User:      user,
		BookID:    book.ID,
		Title:     book.Title,
		EbookFile: ebookFile.String,
	}

	renderTemplate(w, "baca_buku.html", data)
}

// 2. API Handler: History List & Delete
func ebookHistoryAPIHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	user := getCurrentUser(r)
	if user.ID == 0 {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// GET: Ambil daftar history user
	if r.Method == http.MethodGet {
		rows, err := db.Query(`
			SELECT h.id, h.bookId, b.title, b.coverFile, h.lastPage, h.dateLastRead
			FROM ebook_history h
			JOIN books b ON h.bookId = b.id
			WHERE h.userId = ?
			ORDER BY h.dateLastRead DESC
		`, user.ID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Success: false, Message: err.Error()})
			return
		}
		defer rows.Close()

		var history []EbookHistoryItem
		for rows.Next() {
			var item EbookHistoryItem
			var dateRaw time.Time
			var cover sql.NullString
			if err := rows.Scan(&item.ID, &item.BookID, &item.Title, &cover, &item.LastPage, &dateRaw); err != nil {
				continue
			}
			item.CoverFile = cover.String
			item.DateLastRead = dateRaw.Format("2006-01-02 15:04")
			history = append(history, item)
		}
		json.NewEncoder(w).Encode(history)
		return
	}

	// DELETE: Hapus SATU item history berdasarkan ID history
	if r.Method == http.MethodDelete {
		idStr := r.URL.Query().Get("id")
		if idStr == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		// Pastikan hanya bisa hapus punya sendiri
		res, err := db.Exec("DELETE FROM ebook_history WHERE id = ? AND userId = ?", idStr, user.ID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		rowsAffected, _ := res.RowsAffected()
		if rowsAffected == 0 {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(Response{Success: false, Message: "History tidak ditemukan"})
			return
		}

		json.NewEncoder(w).Encode(Response{Success: true, Message: "History berhasil dihapus"})
		return
	}
}

// 3. API Handler: Save & Get Progress
func ebookProgressAPIHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	user := getCurrentUser(r)
	if user.ID == 0 {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// POST: Simpan Progress
	if r.Method == http.MethodPost {
		var req EbookProgressRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		// Insert or Update (Upsert)
		_, err := db.Exec(`
			INSERT INTO ebook_history (userId, bookId, lastPage, dateLastRead)
			VALUES (?, ?, ?, NOW())
			ON DUPLICATE KEY UPDATE lastPage = ?, dateLastRead = NOW()
		`, user.ID, req.BookID, req.Page, req.Page)

		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Success: false, Message: err.Error()})
			return
		}
		json.NewEncoder(w).Encode(Response{Success: true, Message: "Progress saved"})
		return
	}

	// GET: Ambil halaman terakhir (untuk resume)
	if r.Method == http.MethodGet {
		bookId := r.URL.Query().Get("bookId")
		var lastPage int
		err := db.QueryRow("SELECT lastPage FROM ebook_history WHERE userId = ? AND bookId = ?", user.ID, bookId).Scan(&lastPage)
		if err != nil {
			lastPage = 1 // Default halaman 1
		}
		json.NewEncoder(w).Encode(map[string]int{"page": lastPage})
		return
	}
}

// reset passwprd
func profileResetPasswordHandler(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	user, ok := sessions[cookie.Value]
	if !ok {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	tmpl, err := template.ParseFiles("templates/reset_password_profile_admin.html")
	if err != nil {
		http.Error(w, "Template error", http.StatusInternalServerError)
		return
	}

	data := struct {
		Message string
	}{}

	if r.Method == http.MethodPost {
		oldPassword := r.FormValue("old_password")
		newPassword := r.FormValue("new_password")
		confirmPassword := r.FormValue("confirm_password")

		if newPassword != confirmPassword {
			data.Message = "Password baru dan konfirmasi tidak sama"
		} else {
			// ambil password hash dari DB
			var dbPassword string
			err := db.QueryRow("SELECT password FROM users WHERE id=?", user.ID).Scan(&dbPassword)
			if err != nil {
				data.Message = "Gagal mengambil data pengguna"
			} else {
				// verifikasi password lama
				err := bcrypt.CompareHashAndPassword([]byte(dbPassword), []byte(oldPassword))
				if err != nil {
					data.Message = "Password lama salah"
				} else {
					// update password baru
					hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
					_, err := db.Exec("UPDATE users SET password=? WHERE id=?", hashedPassword, user.ID)
					if err != nil {
						data.Message = "Gagal mengubah password"
					} else {
						data.Message = "Password berhasil diubah"
					}
				}
			}
		}
	}

	tmpl.Execute(w, data)
}

// Anggota
func getCurrentUser(r *http.Request) User {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return User{} // jika tidak ada session, return user kosong
	}

	user, ok := sessions[cookie.Value]
	if !ok {
		return User{}
	}

	return user
}

// Render halaman manajemen anggota (data anggota diambil via JS fetch /api/members)
func reloadTemplates() error {
	var err error
	templates, err = template.ParseGlob("templates/*.html")
	return err
}

func manajemenAnggotaHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// reload template tiap request
	if err := reloadTemplates(); err != nil {
		http.Error(w, "Gagal memuat template: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Hanya passing data admin yang login
	data := map[string]interface{}{
		"User": getCurrentUser(r),
	}

	renderTemplate(w, "manajemen_anggota.html", data)
}

// API endpoint untuk ambil JSON anggota
func apiMembersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Ambil query search dari URL
	search := r.URL.Query().Get("search")

	var rows *sql.Rows
	var err error

	if search != "" {
		// Cari di username **atau** fullname
		rows, err = db.Query(`
            SELECT id, fullname, username, email, role, profile_picture 
            FROM users 
            WHERE username LIKE ? OR fullname LIKE ?`,
			"%"+search+"%", "%"+search+"%")
	} else {
		rows, err = db.Query(`SELECT id, fullname, username, email, role, profile_picture FROM users`)
	}

	if err != nil {
		http.Error(w, "Gagal mengambil data user: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var members []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Fullname, &u.Username, &u.Email, &u.Role, &u.ProfilePicture); err != nil {
			log.Println("Scan error:", err)
			continue
		}
		members = append(members, u)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(members)
}

// Update role anggota
func apiUpdateRoleHandler(w http.ResponseWriter, r *http.Request, id int) {
	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if body.Role == "" {
		http.Error(w, "Role cannot be empty", http.StatusBadRequest)
		return
	}

	_, err := db.Exec("UPDATE users SET role=? WHERE id=?", body.Role, id)
	if err != nil {
		http.Error(w, "DB update error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// --- Handler Delete User ---
func apiDeleteUserHandler(w http.ResponseWriter, r *http.Request, id int) {
	_, err := db.Exec("DELETE FROM users WHERE id=?", id)
	if err != nil {
		http.Error(w, "DB delete error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func pengajuanPinjamHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Ambil cookie session
	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// Ambil user dari sessions
	user, ok := sessions[cookie.Value]
	if !ok || user.Role != "member" {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// Pastikan profile picture default jika kosong
	if user.ProfilePicture == "" {
		user.ProfilePicture = "uploads/users/default_user.png"
	} else if !strings.HasPrefix(user.ProfilePicture, "data:") && !strings.HasPrefix(user.ProfilePicture, "uploads/") {
		user.ProfilePicture = "uploads/" + user.ProfilePicture
	}

	// Kirim data ke template
	data := struct {
		User  User
		Title string
	}{
		User:  user,
		Title: "Pengajuan Pinjam Buku",
	}

	renderTemplate(w, "pengajuan_pinjam.html", data)
}

func manajemenPengajuanHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 🔹 Update fineTotal otomatis sebelum render dashboard
	if err := updateFineTotals(); err != nil {
		log.Println("Gagal update fine totals:", err)
		// tetap lanjut render template walaupun update gagal
	}

	// Ambil cookie session
	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// Ambil user dari sessions
	user, ok := sessions[cookie.Value]
	if !ok || user.Role != "admin" {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// Pastikan profile picture default jika kosong
	if user.ProfilePicture == "" {
		user.ProfilePicture = "uploads/users/default_user.png"
	} else if !strings.HasPrefix(user.ProfilePicture, "data:") && !strings.HasPrefix(user.ProfilePicture, "uploads/") {
		user.ProfilePicture = "uploads/" + user.ProfilePicture
	}

	// Kirim data ke template
	data := struct {
		User  User
		Title string
	}{
		User:  user,
		Title: "Pengajuan Pinjam Buku",
	}

	renderTemplate(w, "manajemen_pengajuan.html", data)
}

// Handler pinjam buku
func handleBorrowBook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Method not allowed",
		})
		return
	}

	// Ambil session
	cookie, err := r.Cookie("session_id")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "User belum login",
		})
		return
	}

	user, ok := sessions[cookie.Value]
	if !ok || user.Role != "member" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Session tidak valid atau bukan member",
		})
		return
	}

	// Pastikan foto profil ada
	if user.ProfilePicture == "" {
		user.ProfilePicture = "uploads/users/default_user.png"
	} else if !strings.HasPrefix(user.ProfilePicture, "data:") && !strings.HasPrefix(user.ProfilePicture, "uploads/") {
		user.ProfilePicture = "uploads/" + user.ProfilePicture
	}

	// Ambil request body
	var req struct {
		BookID int `json:"book_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Request tidak valid",
		})
		return
	}

	// Mulai transaksi
	tx, err := db.Begin()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Cek apakah user sudah pernah mengajukan buku ini
	var exists int
	err = tx.QueryRow(`SELECT COUNT(*) FROM transactions 
        WHERE book_id = ? AND user_id = ? AND status = 'diajukan'`,
		req.BookID, user.ID).Scan(&exists)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if exists > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Anda sudah pernah mengajukan buku ini. Tunggu persetujuan admin.",
			"profile": user.ProfilePicture,
		})
		return
	}

	// Ambil stokMax buku
	var stockMax int
	var title string
	err = tx.QueryRow("SELECT title, stockMax FROM books WHERE id = ?", req.BookID).Scan(&title, &stockMax)
	if err != nil {
		if err == sql.ErrNoRows {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success": false,
				"message": "Buku tidak ditemukan",
				"profile": user.ProfilePicture,
			})
			return
		}
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	if stockMax <= 0 {
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"message": "Stok buku habis",
			"profile": user.ProfilePicture,
		})
		return
	}

	// Kurangi stokMax
	_, err = tx.Exec("UPDATE books SET stockMax = stockMax - 1 WHERE id = ?", req.BookID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Masukkan record peminjaman dengan status 'diajukan'
	_, err = tx.Exec(`INSERT INTO transactions 
        (book_id, user_id, status, dateRequested) 
        VALUES (?, ?, 'diajukan', NOW())`,
		req.BookID, user.ID)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Commit transaksi
	err = tx.Commit()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	// Response sukses dengan data profil user
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Pengajuan buku berhasil dibuat. Tunggu persetujuan admin.",
		"user":    user.Fullname,
		"profile": user.ProfilePicture,
		"stock":   stockMax - 1,
		"title":   title,
	})
}

func cancelBorrowHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "User belum login", http.StatusUnauthorized)
		return
	}

	user, ok := sessions[cookie.Value]
	if !ok || user.Role != "member" {
		http.Error(w, "Session tidak valid atau bukan member", http.StatusUnauthorized)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		http.Error(w, "ID tidak ditemukan", http.StatusBadRequest)
		return
	}
	id, _ := strconv.Atoi(parts[4])

	// Mulai transaksi
	tx, err := db.Begin()
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// Ambil book_id
	var bookID int
	err = tx.QueryRow("SELECT book_id FROM transactions WHERE id=? AND user_id=? AND status='DIAJUKAN'", id, user.ID).Scan(&bookID)
	if err != nil {
		http.Error(w, "Transaksi tidak ditemukan atau tidak bisa dibatalkan", http.StatusNotFound)
		return
	}

	// Update status jadi DIBATALKAN
	_, err = tx.Exec("UPDATE transactions SET status='DIBATALKAN' WHERE id=?", id)
	if err != nil {
		http.Error(w, "Gagal update status", http.StatusInternalServerError)
		return
	}

	// Tambah kembali stok buku
	_, err = tx.Exec("UPDATE books SET stockMax = stockMax + 1 WHERE id=?", bookID)
	if err != nil {
		http.Error(w, "Gagal rollback stok buku", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Peminjaman dibatalkan, stok buku dikembalikan",
	})
}

// [UPDATE] riwayatPinjamHandler di main.go
func riwayatPinjamHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json") // Pindah ke atas biar aman

	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Error(w, "User belum login", http.StatusUnauthorized)
		return
	}

	user, ok := sessions[cookie.Value]
	if !ok {
		http.Error(w, "Session tidak valid", http.StatusUnauthorized)
		return
	}

	// 🔹 Hitung denda dulu sebelum fetch agar data fresh
	if err := updateFineTotals(); err != nil {
		log.Println("Gagal update fine totals:", err)
	}

	// [PENTING] Query Select Tanggal Lengkap (Sama seperti Admin)
	rows, err := db.Query(`
        SELECT 
            t.id, 
            b.title AS bookTitle, 
            b.coverFile, 
            t.status, 
            t.dateRequested, 
            t.dateApproved,   -- Baru
            t.dateBorrowed,   -- Baru
            t.dateDue, 
            t.dateReturned,
            t.dateRejected,   -- Baru
            t.dateCanceled,   -- Baru
            t.dateLost,       -- Baru
            t.fineTotal
        FROM transactions t
        JOIN books b ON t.book_id = b.id
        WHERE t.user_id = ?
        ORDER BY t.dateRequested DESC
    `, user.ID)

	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var history []map[string]interface{}
	for rows.Next() {
		var id int
		var bookTitle, coverFile, status string
		// Gunakan NullString untuk tanggal-tanggal opsional
		var dateRequested string
		var dateApproved, dateBorrowed, dateDue, dateReturned, dateRejected, dateCanceled, dateLost sql.NullString
		var fineTotal float64

		if err := rows.Scan(&id, &bookTitle, &coverFile, &status, &dateRequested,
			&dateApproved, &dateBorrowed, &dateDue, &dateReturned,
			&dateRejected, &dateCanceled, &dateLost,
			&fineTotal); err != nil {
			log.Println("Scan error:", err)
			continue
		}

		entry := map[string]interface{}{
			"id":            id,
			"bookTitle":     bookTitle,
			"coverFile":     coverFile,
			"status":        status,
			"dateRequested": dateRequested,
			"fineTotal":     fineTotal,
		}

		// Masukkan tanggal jika valid
		if dateApproved.Valid {
			entry["dateApproved"] = dateApproved.String
		}
		if dateBorrowed.Valid {
			entry["dateBorrowed"] = dateBorrowed.String
		}
		if dateDue.Valid {
			entry["dateDue"] = dateDue.String
		}
		if dateReturned.Valid {
			entry["dateReturned"] = dateReturned.String
		}
		if dateRejected.Valid {
			entry["dateRejected"] = dateRejected.String
		}
		if dateCanceled.Valid {
			entry["dateCanceled"] = dateCanceled.String
		}
		if dateLost.Valid {
			entry["dateLost"] = dateLost.String
		}

		history = append(history, entry)
	}

	json.NewEncoder(w).Encode(history)
}

// Handler untuk mengambil semua riwayat pinjam admin
func adminListTransactionsHandler(w http.ResponseWriter, r *http.Request) {
	// ==========================================
	// 1. VALIDASI SESSION (WAJIB DIISI)
	// ==========================================
	cookie, err := r.Cookie("session_id")
	if err != nil {
		// Jika tidak ada cookie, tolak akses
		http.Error(w, "Unauthorized: No session", http.StatusUnauthorized)
		return
	}

	user, ok := sessions[cookie.Value]
	if !ok || user.Role != "admin" {
		// Jika session tidak valid atau bukan admin, tolak akses
		http.Error(w, "Unauthorized: Invalid session or not admin", http.StatusUnauthorized)
		return
	}

	// ==========================================
	// 2. LOGIKA UTAMA
	// ==========================================

	// Update denda dulu sebelum ambil data
	if err := updateFineTotals(); err != nil {
		log.Println("Gagal update fine totals:", err)
	}

	// Query Data Transaksi Lengkap (Termasuk Tanggal-Tanggal Baru)
	rows, err := db.Query(`
        SELECT 
            t.id, 
            b.title AS bookTitle, 
            b.coverFile,
            b.fineAmount AS bookPrice,  
            t.status,
            t.dateRequested,
            t.dateApproved,
            t.dateBorrowed,   -- Baru
            t.dateDue,
            t.dateReturned,
            t.dateRejected,   -- Baru
            t.dateCanceled,   -- Baru
            t.dateLost,       -- Baru
            t.fineTotal,
            t.finePerDay,
            u.username AS userName
        FROM transactions t
        JOIN books b ON t.book_id = b.id
        JOIN users u ON t.user_id = u.id
        ORDER BY t.dateRequested DESC
    `)
	if err != nil {
		log.Println("ERR select transactions:", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var transactions []map[string]interface{}
	for rows.Next() {
		var (
			id            int
			bookTitle     string
			coverFile     string
			bookPrice     float64
			status        string
			dateRequested string
			// Gunakan sql.NullString untuk tanggal yang mungkin NULL
			dateApproved, dateBorrowed, dateDue, dateReturned, dateRejected, dateCanceled, dateLost sql.NullString
			fineTotal                                                                               float64
			finePerDay                                                                              float64
			userName                                                                                string
		)

		// Scan data dari database ke variabel Go
		if err := rows.Scan(&id, &bookTitle, &coverFile, &bookPrice, &status, &dateRequested,
			&dateApproved, &dateBorrowed, &dateDue, &dateReturned,
			&dateRejected, &dateCanceled, &dateLost,
			&fineTotal, &finePerDay, &userName); err != nil {
			log.Println("ERR scan transaction:", err)
			continue
		}

		// Masukkan ke Map untuk JSON
		entry := map[string]interface{}{
			"id":            id,
			"bookTitle":     bookTitle,
			"coverFile":     coverFile,
			"bookPrice":     bookPrice,
			"status":        status,
			"dateRequested": dateRequested,
			"fineTotal":     fineTotal,
			"finePerDay":    finePerDay,
			"userName":      userName,
		}

		// Masukkan tanggal hanya jika valid (tidak NULL)
		if dateApproved.Valid {
			entry["dateApproved"] = dateApproved.String
		}
		if dateBorrowed.Valid {
			entry["dateBorrowed"] = dateBorrowed.String
		}
		if dateDue.Valid {
			entry["dateDue"] = dateDue.String
		}
		if dateReturned.Valid {
			entry["dateReturned"] = dateReturned.String
		}
		if dateRejected.Valid {
			entry["dateRejected"] = dateRejected.String
		}
		if dateCanceled.Valid {
			entry["dateCanceled"] = dateCanceled.String
		}
		if dateLost.Valid {
			entry["dateLost"] = dateLost.String
		}

		transactions = append(transactions, entry)
	}

	// Kirim response JSON ke Frontend
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(transactions)
}

// [UPDATE] Fungsi Hitung Denda (Logic: 10rb Awal + 5rb/Hari)
func updateFineTotals() error {
	// Logic: Jika terlambat > 0 hari:
	// Denda = 10.000 + (Hari_Terlambat * 5.000)
	// Jika tidak terlambat = 0

	// Query untuk Update DIPINJAM (Realtime)
	// TIMESTAMPDIFF(DAY, dateDue, NOW()) menghitung selisih hari.
	// Kita gunakan CASE WHEN untuk cek apakah lewat due date
	_, err := db.Exec(`
        UPDATE transactions
        SET fineTotal = CASE 
            WHEN NOW() > dateDue THEN 
                10000 + (TIMESTAMPDIFF(DAY, dateDue, NOW()) * 5000)
            ELSE 0 
        END
        WHERE status = 'DIPINJAM' AND dateDue IS NOT NULL
    `)

	if err != nil {
		return err
	}

	// Query untuk Update DIKEMBALIKAN (Fixing denda saat kembali, jika admin lupa)
	// Menggunakan dateReturned sebagai patokan
	_, err = db.Exec(`
        UPDATE transactions
        SET fineTotal = CASE 
            WHEN dateReturned > dateDue THEN 
                10000 + (TIMESTAMPDIFF(DAY, dateDue, dateReturned) * 5000)
            ELSE 0 
        END
        WHERE status = 'DIKEMBALIKAN' AND dateDue IS NOT NULL AND dateReturned IS NOT NULL
    `)

	return err
}

// Ebook Bookmarks & Kritik Saran
func ebookHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Ambil cookie session
	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// Ambil user dari sessions
	user, ok := sessions[cookie.Value]
	if !ok || user.Role != "member" {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// Pastikan profile picture default jika kosong
	if user.ProfilePicture == "" {
		user.ProfilePicture = "uploads/users/default_user.png"
	} else if !strings.HasPrefix(user.ProfilePicture, "data:") && !strings.HasPrefix(user.ProfilePicture, "uploads/") {
		user.ProfilePicture = "uploads/" + user.ProfilePicture
	}

	// Kirim data ke template
	data := struct {
		User  User
		Title string
	}{
		User:  user,
		Title: "Pengajuan Pinjam Buku",
	}

	renderTemplate(w, "ebook.html", data)
}

// Ambil userId dari session
func getUserIdFromSession(r *http.Request) (int, error) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		return 0, err
	}

	user, ok := sessions[cookie.Value]
	if !ok {
		return 0, fmt.Errorf("session tidak valid")
	}

	return user.ID, nil
}

func bookmarkPageHandler(w http.ResponseWriter, r *http.Request) {
	// Ambil cookie session
	cookie, err := r.Cookie("session_id")
	if err != nil {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// Ambil user dari sessions
	user, ok := sessions[cookie.Value]
	if !ok {
		http.Redirect(w, r, "/login", http.StatusSeeOther)
		return
	}

	// Pastikan profile picture default jika kosong
	if user.ProfilePicture == "" {
		user.ProfilePicture = "uploads/users/default_user.png"
	} else if !strings.HasPrefix(user.ProfilePicture, "data:") && !strings.HasPrefix(user.ProfilePicture, "uploads/") {
		user.ProfilePicture = "uploads/" + user.ProfilePicture
	}

	// Data tambahan untuk template
	data := struct {
		User  User
		Title string
	}{
		User:  user,
		Title: "Bookmark Buku",
	}

	// Render template HTML
	renderTemplate(w, "bookmark.html", data)
}

// Handler tambah databases bookmark
func bookmarkHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userId, err := getUserIdFromSession(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(Response{Success: false, Message: "User belum login"})
		return
	}

	switch r.Method {
	case http.MethodPost:
		var bm Bookmark
		if err := json.NewDecoder(r.Body).Decode(&bm); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Success: false, Message: "Body invalid"})
			return
		}

		_, err := db.Exec("INSERT INTO bookmarks (userId, bookId) VALUES (?, ?)", userId, bm.BookId)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Success: false, Message: err.Error()})
			return
		}

		json.NewEncoder(w).Encode(Response{Success: true, Message: "Bookmark berhasil ditambahkan"})

	case http.MethodDelete:
		var bm Bookmark
		if err := json.NewDecoder(r.Body).Decode(&bm); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Success: false, Message: "Body invalid"})
			return
		}

		_, err := db.Exec("DELETE FROM bookmarks WHERE userId=? AND bookId=?", userId, bm.BookId)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Success: false, Message: err.Error()})
			return
		}

		json.NewEncoder(w).Encode(Response{Success: true, Message: "Bookmark berhasil dihapus"})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(Response{Success: false, Message: "Method tidak diizinkan"})
	}
}

func checkBookmarkHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userId, err := getUserIdFromSession(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(Response{Success: false, Message: "User belum login"})
		return
	}

	bookIdStr := r.URL.Query().Get("bookId")
	bookId, _ := strconv.Atoi(bookIdStr)

	var exists int
	err = db.QueryRow("SELECT COUNT(*) FROM bookmarks WHERE userId=? AND bookId=?", userId, bookId).Scan(&exists)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(Response{Success: false, Message: err.Error()})
		return
	}

	json.NewEncoder(w).Encode(map[string]bool{"bookmarked": exists > 0})
}

func getBookmarksHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	userId, err := getUserIdFromSession(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(Response{Success: false, Message: "User belum login"})
		return
	}

	// QUERY: Mengambil semua kolom persis seperti listBooksHandler
	query := `
        SELECT 
            b.id, b.title, b.author, b.year, b.genre, b.category, b.type, 
            b.stockMax, b.fineAmount, b.description, b.coverFile, b.location, b.ebookFile
        FROM bookmarks bm
        JOIN books b ON bm.bookId = b.id
        WHERE bm.userId = ?`

	rows, err := db.Query(query, userId)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(Response{Success: false, Message: err.Error()})
		return
	}
	defer rows.Close()

	// Slice of Maps (Sama persis formatnya dengan listBooksHandler)
	var booksList []map[string]interface{}

	for rows.Next() {
		var id int
		var year, stockMax, fineAmount sql.NullInt64
		var title, author, genre, category, tipe, description, coverFile, location, ebookFile sql.NullString

		// Scan menggunakan sql.Null types untuk keamanan data kosong
		if err := rows.Scan(&id, &title, &author, &year, &genre, &category, &tipe,
			&stockMax, &fineAmount, &description, &coverFile, &location, &ebookFile); err != nil {
			log.Println("Scan error in bookmarks:", err)
			continue
		}

		// Mapping ke JSON
		booksList = append(booksList, map[string]interface{}{
			"id":          id,
			"title":       title.String,
			"author":      author.String,
			"year":        int(year.Int64),
			"genre":       genre.String,
			"category":    category.String,
			"type":        tipe.String,
			"stock":       int(stockMax.Int64),
			"fineAmount":  int(fineAmount.Int64),
			"description": description.String,
			"coverFile":   coverFile.String,
			"location":    location.String,
			"ebookFile":   ebookFile.String,
		})
	}

	json.NewEncoder(w).Encode(booksList)
}
