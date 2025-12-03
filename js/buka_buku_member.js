console.log("📖 buka_buku_member.js loaded");

// Ambil ID buku dari URL
const params = new URLSearchParams(window.location.search);
const bookId = params.get("id");

// --- TAMBAHAN: Ambil User ID dari Meta Tag HTML ---
const metaUser = document.querySelector('meta[name="user-id"]');
const currentUserId = metaUser ? parseInt(metaUser.content) : 0;
// --------------------------------------------------

// Elemen UI Halaman Utama
const detailCover = document.getElementById("detail-cover");
const detailTitle = document.getElementById("detail-title");
const detailAuthor = document.getElementById("detail-author");
const detailTahun = document.getElementById("detail-tahun");
const detailKategori = document.getElementById("detail-kategori");
const detailGenre = document.getElementById("detail-genre");
const detailJenis = document.getElementById("detail-jenis");
const detailSynopsis = document.getElementById("detail-synopsis");
const stockDisplay = document.getElementById("detail-stock");

const btnPinjam = document.getElementById("btn-pinjam");
const btnBaca = document.getElementById("btn-baca");
const bookmarkBtn = document.getElementById("bookmark-btn");

// Elemen UI Modal
const modalPinjam = document.getElementById("modal-pinjam");
const closeModalBtn = document.getElementById("close-modal-pinjam");
const btnBatalPinjam = document.getElementById("btn-batal-pinjam");
const btnKonfirmasiPinjam = document.getElementById("btn-konfirmasi-pinjam");
const displayDendaHilang = document.getElementById("pinjam-denda-hilang");

let isBookmarked = false;
let currentBook = null;

// Validasi ID Buku
if (!bookId) {
    alert("ID buku tidak ditemukan!");
    window.location.href = "/member";
} else {
    loadBookDetail();
}

// --- TAMBAHAN: Helper Cek Login ---
function checkLogin() {
    if (currentUserId === 0) {
        // Tampilkan alert konfirmasi
        if (confirm("Silakan login terlebih dahulu untuk mengakses fitur ini.")) {
            window.location.href = "/login";
        }
        return false;
    }
    return true;
}

// 1. Load Data Buku
async function loadBookDetail() {
    try {
        const res = await fetch("/books");
        const books = await res.json();
        const book = books.find((b) => b.id == bookId);

        if (!book) {
            alert("Buku tidak ditemukan!");
            return;
        }

        currentBook = book;
        renderBookInfo(book);
        
        // Hanya cek status bookmark jika user sudah login
        if (currentUserId !== 0) {
            checkBookmarkStatus();
        }

    } catch (err) {
        console.error("Error loading detail:", err);
        detailTitle.textContent = "Gagal memuat data buku.";
    }
}

// Helper Render Info Buku
function renderBookInfo(book) {
    detailCover.src = book.coverFile ? "/" + book.coverFile : "/img/default_book.png";
    detailTitle.textContent = book.title;
    detailAuthor.textContent = book.author;
    detailTahun.textContent = book.year || "-";
    detailKategori.textContent = book.category || "-";
    detailGenre.textContent = book.genre || "-";
    detailJenis.textContent = `Tipe: ${book.type}`;
    detailSynopsis.textContent = book.description || "Tidak ada sinopsis.";

    // Reset tombol & display
    btnBaca.classList.add("hidden");
    btnPinjam.classList.add("hidden");
    stockDisplay.style.display = "block"; // Default tampil

    // Logika tombol baca/pinjam & Stok
    if (book.type === "Ebook") {
        btnBaca.classList.remove("hidden");
        // --- UBAH: Hilangkan stok jika Ebook ---
        stockDisplay.style.display = "none"; 
    } else if (book.type === "Fisik & Ebook") {
        btnBaca.classList.remove("hidden");
        btnPinjam.classList.remove("hidden");
        stockDisplay.textContent = `Stok tersedia: ${book.stock || 0}`;
    } else if (book.type === "Buku Fisik") {
        btnPinjam.classList.remove("hidden");
        stockDisplay.textContent = `Stok tersedia: ${book.stock || 0}`;
    }

    // Action Tombol Baca
    btnBaca.onclick = () => {
        if (checkLogin()) {
            window.location.href = `/baca_buku?id=${book.id}`;
        }
    };
    
    // Action Tombol Pinjam (Buka Modal)
    btnPinjam.onclick = () => {
        if (!checkLogin()) return; // Cek login dulu

        // Cek stok sebelum buka modal
        if (book.stock <= 0 && book.type !== "Ebook") {
            alert("Maaf, stok buku ini sedang habis.");
            return;
        }

        // Set Denda Hilang di Modal
        const dendaHilang = book.fineAmount ?? 0;
        displayDendaHilang.textContent = new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR"
        }).format(dendaHilang);

        modalPinjam.classList.remove("hidden");
    };
}

// --- LOGIKA MODAL PINJAM ---
function closeModal() {
    modalPinjam.classList.add("hidden");
}

closeModalBtn.addEventListener("click", closeModal);
btnBatalPinjam.addEventListener("click", closeModal);
modalPinjam.addEventListener("click", (e) => {
    if (e.target === modalPinjam) closeModal();
});

// Event Listener KONFIRMASI (SUBMIT)
btnKonfirmasiPinjam.addEventListener("click", async () => {
    // Double check login saat submit (untuk keamanan)
    if (!checkLogin()) return;
    if (!currentBook) return;

    const originalText = btnKonfirmasiPinjam.innerHTML;
    btnKonfirmasiPinjam.disabled = true;
    btnKonfirmasiPinjam.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';

    try {
        const res = await fetch("/pinjambuku", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ book_id: currentBook.id }),
        });
        const data = await res.json();

        if (data.success) {
            alert("✅ " + data.message);
            closeModal();
            location.reload(); 
        } else {
            alert("❌ Gagal: " + data.message);
            closeModal();
        }
    } catch (e) {
        console.error(e);
        alert("⚠ Terjadi kesalahan sistem saat menghubungi server.");
    } finally {
        btnKonfirmasiPinjam.disabled = false;
        btnKonfirmasiPinjam.innerHTML = originalText;
    }
});

// --- LOGIKA BOOKMARK ---
async function checkBookmarkStatus() {
    // Fungsi ini hanya dipanggil jika userId != 0 (lihat loadBookDetail)
    try {
        const res = await fetch(`/bookmark/status?bookId=${bookId}`);
        // Handle jika session expire / 401
        if (res.status === 401) return; 
        
        const data = await res.json();
        isBookmarked = data.bookmarked;
        updateBookmarkUI();
    } catch (err) {
        console.error("Gagal cek bookmark:", err);
    }
}

function updateBookmarkUI() {
    const icon = bookmarkBtn.querySelector("i");
    // Reset basic style
    bookmarkBtn.className = "absolute top-4 right-4 p-3 rounded-full shadow-lg transition-all duration-300 flex items-center justify-center border-2 z-10";

    if (isBookmarked) {
        bookmarkBtn.classList.add("bg-white", "border-gray-200", "text-gray-400", "hover:text-yellow-500", "hover:border-yellow-400");
        bookmarkBtn.title = "Hapus dari Bookmark";
        icon.className = "fas fa-bookmark text-xl"; 
    } else {
        bookmarkBtn.classList.add("bg-yellow-400", "border-yellow-500", "text-white", "hover:bg-yellow-500");
        bookmarkBtn.title = "Tambahkan ke Bookmark";
        icon.className = "far fa-bookmark text-xl";
    }
}

bookmarkBtn.addEventListener("click", async () => {
    // Tambahkan Cek Login disini
    if (!checkLogin()) return;

    if (!currentBook) return;
    const method = isBookmarked ? "DELETE" : "POST";
    bookmarkBtn.disabled = true;
    bookmarkBtn.style.transform = "scale(0.9)";

    try {
        const res = await fetch("/bookmark", {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookId: currentBook.id }),
        });
        
        // Handle unauthorized response
        if (res.status === 401) {
             alert("Sesi habis. Silakan login kembali.");
             window.location.href = "/login";
             return;
        }

        const data = await res.json();
        if (data.success) {
            isBookmarked = !isBookmarked;
            updateBookmarkUI();
            if (isBookmarked) alert(`📚 Buku ditambahkan ke Bookmark.`);
            else alert(`Buku dihapus dari Bookmark.`);
        } else {
            alert(`Gagal: ${data.message}`);
        }
    } catch (err) {
        console.error(err);
        alert("Kesalahan koneksi.");
    } finally {
        bookmarkBtn.disabled = false;
        bookmarkBtn.style.transform = "scale(1)";
    }
});