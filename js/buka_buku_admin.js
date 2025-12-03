// Ambil ID buku dari URL
const params = new URLSearchParams(window.location.search);
const bookId = params.get('id');

// Elemen detail
const detailCover = document.getElementById('detail-cover');
const detailTitle = document.getElementById('detail-title');
const detailAuthor = document.getElementById('detail-author');
const detailTahun = document.getElementById('detail-tahun');
const detailKategori = document.getElementById('detail-kategori');
const detailGenre = document.getElementById('detail-genre');
const detailJenis = document.getElementById('detail-jenis');
const detailSynopsis = document.getElementById('detail-synopsis');
const btnEdit = document.getElementById('btn-edit');
const btnHapus = document.getElementById('btn-hapus');
const locationDisplay = document.getElementById('detail-location');
const detailDenda = document.getElementById('detail-denda');
const stockDisplay = document.getElementById('detail-stock');

// Elemen edit
const editBar = document.getElementById('edit-book-bar-container');
const editForm = document.getElementById('edit-book-form');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const editTitle = document.getElementById('edit-title');
const editAuthor = document.getElementById('edit-author');
const editYear = document.getElementById('edit-year');
const editCategory = document.getElementById('edit-category');
const editType = document.getElementById('edit-type');
const editGenre = document.getElementById('edit-genre');
const editLokasi = document.getElementById('edit-lokasi');
const editSynopsis = document.getElementById('edit-synopsis');
const editDenda = document.getElementById('edit-fineAmount');
const editStock = document.getElementById('edit-stockMax');

// Data buku saat ini
let bookData = null;

async function loadBookDetail() {
    if(!bookId) {
        alert("ID buku tidak ditemukan!");
        return;
    }

    try {
        const res = await fetch('/books'); // Ambil semua buku
        const books = await res.json();

        const book = books.find(b => b.id == bookId);
        if(!book) {
            alert("Buku tidak ditemukan!");
            return;
        }

        bookData = book; // simpan data buku

        // Update detail buku
        detailCover.src = book.coverFile ? '/' + book.coverFile : 'img/default_book.png';
        detailTitle.textContent = book.title;
        detailAuthor.textContent = book.author;
        detailTahun.textContent = book.year;
        detailKategori.textContent = book.category || '-';
        detailGenre.textContent = book.genre || '-';
        detailJenis.textContent = `ID: ${book.id} | Tipe: ${book.type}`;
        detailSynopsis.textContent = book.description;
        stockDisplay.textContent = `Stok: ${book.stock || 0}`;
        locationDisplay.textContent = book.location || '-'; 

        

        let fineAmount = 0;
        if (book.fineAmount !== undefined && book.fineAmount !== null && book.fineAmount !== '') {
            fineAmount = Number(book.fineAmount);
            if (isNaN(fineAmount)) fineAmount = 0;
        }

        // Menangani Stok berdasarkan jenis buku
        if (book.type === "Ebook") {
            stockDisplay.style.display = 'none'; // Sembunyikan stok jika Ebook
        } else {
            stockDisplay.style.display = 'block'; // Tampilkan stok jika Buku Fisik
            stockDisplay.textContent = `Stok: ${book.stock || 0}`;
        }

        // Tombol edit & hapus
        btnEdit.dataset.bookId = book.id;
        btnHapus.dataset.bookId = book.id;

    } catch(err) {
        console.error(err);
        alert("Gagal memuat data buku.");
    }

}

// Tombol Hapus
btnHapus.addEventListener('click', async () => {
    const id = btnHapus.dataset.bookId;
    if(confirm("Yakin ingin menghapus buku ini?")) {
        try {
            const res = await fetch(`/books/${id}`, { method: 'DELETE' });
            if(res.ok) {
                alert("Buku berhasil dihapus!");
                window.location.href = '/admin';
            } else {
                alert("Gagal menghapus buku.");
            }
        } catch(err) {
            console.error(err);
            alert("Terjadi kesalahan saat menghapus buku.");
        }
    }
});

// Tombol Edit
btnEdit.addEventListener('click', () => {
    if (!bookData) return;

    editForm.reset();

    editTitle.value = bookData.title || '';
    editAuthor.value = bookData.author || '';
    editYear.value = bookData.year || '';
    editCategory.value = bookData.category || '';
    editType.value = bookData.type || '';
    editGenre.value = bookData.genre || '';
    editSynopsis.value = bookData.description || '';
    editLokasi.value = bookData.location || '';
    // === STOCKMAX DIPROSES AMAN ===
let safeStock = Number(bookData.stock);
if (isNaN(safeStock)) safeStock = 0;

editStock.value = safeStock;


    // === DENDA DIPROSES AMAN ===
    let fineAmount = 0;
    if (bookData.fineAmount !== undefined && bookData.fineAmount !== null && bookData.fineAmount !== '') {
        fineAmount = Number(bookData.fineAmount);
        if (isNaN(fineAmount)) fineAmount = 0;
    }
    editDenda.value = fineAmount;

    document.getElementById('edit-book-id').value = bookData.id;

    editBar.classList.remove('hidden');
    editBar.scrollIntoView({ behavior: 'smooth' });
});


// Tombol Batal
cancelEditBtn.addEventListener('click', () => editBar.classList.add('hidden'));

loadBookDetail();

// Submit form edit
editForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(editForm);

    // Ganti synopsis -> description
    formData.set('description', formData.get('synopsis'));
    formData.delete('synopsis');

    // === DENDA AMAN ===
    let fineAmount = Number(formData.get('fineAmount'));
    if (isNaN(fineAmount)) fineAmount = 0;
    formData.set('fineAmount', fineAmount);

    // === STOK AMAN, MIRIP DENDA ===
let safeStock = Number(formData.get('stock'));
if (isNaN(safeStock)) safeStock = 0;
formData.set('stock', safeStock);



    try {
        const res = await fetch('/books/update', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();
        if (data.success) {
            alert(data.message);
            editBar.classList.add('hidden');
            location.reload();
        } else {
            alert("Gagal memperbarui buku: " + data.message);
        }
    } catch (err) {
        console.error(err);
        alert("Terjadi kesalahan saat memperbarui buku");
    }
});



// Tombol batal
document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    editBar.classList.add('hidden');
});

